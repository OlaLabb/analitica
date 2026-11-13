"""Generación de predicciones: ranking de candidatos por variable, explicación e incertidumbre.

Toda explicación se construye en el mismo momento del cálculo, con los mismos números que produjeron
el ranking (no se inventan razones a posteriori). El "puntaje" es la probabilidad que asigna el
modelo, NO una probabilidad demostrada de que el número salga.
"""
from __future__ import annotations

from datetime import date

import numpy as np
import pandas as pd
from scipy import stats

from app.engine import ALGORITHM_VERSION, MAIN_VARIABLES, VARIABLE_LABELS, VARIABLES
from app.engine.combinations import CombinationError, independent_argmax, top_combinations
from app.engine.config import MODEL_DESCRIPTIONS, EngineConfig, sha256_json
from app.engine.context import AnalysisContext
from app.engine.models import Target, VariableState, ranking
from app.engine.stats_utils import adjust_pvalues, safe_float

DISCLAIMER = (
    "Las predicciones son rankings estadísticos basados en el histórico. Si el sorteo es aleatorio e "
    "independiente, ningún modelo puede superar al azar de forma consistente. Consulte el backtesting "
    "para ver el desempeño real frente a la línea base aleatoria."
)


def build_states(frame: pd.DataFrame, ctx: AnalysisContext, config: EngineConfig) -> dict[str, VariableState]:
    states = {}
    wds = frame["weekday"].to_numpy()
    months = frame["draw_date"].dt.month.to_numpy()
    for var in VARIABLES:
        dom = ctx.domains[var]
        st = VariableState(dom.size, ctx.baselines[var].probs, config)
        idx = dom.index_of(frame[var].to_numpy())
        for i in range(len(frame)):
            st.update(int(idx[i]), int(wds[i]), int(months[i]))
        states[var] = st
    return states


def _r(x, nd=10):
    v = safe_float(x)
    return None if v is None else round(v, nd)


def _uncertainty(count: float, n: int, p0: float, alpha: float, p_bh: float | None) -> dict:
    """Intervalo creíble (Beta posterior con prior centrado en la referencia) para la probabilidad
    real por sorteo, y nivel de incertidumbre frente al azar."""
    a = count + alpha * p0
    b = (n - count) + alpha * (1 - p0)
    lo, hi = stats.beta.ppf([0.05, 0.95], a, b)
    compatible = bool(lo <= p0 <= hi)
    if n < 100 or compatible:
        level = "alta"
        text = ("La evidencia es compatible con el azar: el intervalo creíble del 90 % incluye la "
                "probabilidad de referencia.") if compatible else "Muestra pequeña (menos de 100 sorteos)."
    elif p_bh is None or p_bh >= 0.05:
        level = "media"
        text = ("El intervalo excluye la referencia, pero la diferencia no es significativa tras corregir "
                "por comparaciones múltiples.")
    else:
        level = "baja"
        text = "Desviación significativa frente a la referencia incluso tras corregir por comparaciones múltiples."
    return {"level": level, "credible_90": [_r(lo), _r(hi)], "compatible_with_reference": compatible,
            "p_value_bh": _r(p_bh), "explanation": text}


def predict(frame: pd.DataFrame, ctx: AnalysisContext, config: EngineConfig, target_date: date,
            window_info: dict | None = None) -> dict:
    """Predicción completa para ``target_date`` usando solo ``frame`` (sorteos anteriores al objetivo)."""
    if len(frame) and frame["draw_date"].max() >= pd.Timestamp(target_date):
        raise ValueError("El conjunto de datos contiene sorteos en o después de la fecha objetivo (leakage).")
    target = Target(weekday=target_date.weekday(), month=target_date.month)
    states = build_states(frame, ctx, config)
    official = config.official_model
    n = len(frame)
    dates = frame["draw_date"].dt.date.astype(str).tolist()
    wd_mask = frame["weekday"].to_numpy() == target.weekday
    month_mask = frame["draw_date"].dt.month.to_numpy() == target.month
    recent_w = next((s.window for s in config.models if s.type == "frequency_recent"), 50)
    weights = config.ensemble_weights
    wsum = sum(weights.values()) if weights else 1.0
    variables: dict[str, dict] = {}
    official_probs: dict[str, np.ndarray] = {}
    warnings: list[str] = []
    for var in VARIABLES:
        dom, base = ctx.domains[var], ctx.baselines[var]
        st = states[var]
        probs = st.predict_all(config, target)
        p = probs[official]
        official_probs[var] = p
        order = ranking(p, dom.values)
        model_ranks = {m: np.empty(dom.size, dtype=int) for m in probs}
        for m, pm in probs.items():
            model_ranks[m][ranking(pm, dom.values)] = np.arange(1, dom.size + 1)
        idx = dom.index_of(frame[var].to_numpy())
        valid = idx >= 0
        counts = np.bincount(idx[valid], minlength=dom.size).astype(float)
        recent_idx = idx[-recent_w:]
        recent_counts = np.bincount(recent_idx[recent_idx >= 0], minlength=dom.size).astype(float)
        wd_counts = np.bincount(idx[valid & wd_mask], minlength=dom.size).astype(float)
        month_counts = np.bincount(idx[valid & month_mask], minlength=dom.size).astype(float)
        n_wd, n_month = int((valid & wd_mask).sum()), int((valid & month_mask).sum())
        pvals = np.array([stats.binomtest(int(c), n, float(q)).pvalue if n and 0 < q < 1 else np.nan
                          for c, q in zip(counts, base.probs)])
        p_bh = adjust_pvalues(pvals)
        rec_spec = next((s for s in config.models if s.type == "recurrence"), None)
        rec_ratio = st.recurrence_ratio_for(rec_spec) if rec_spec else None
        candidates = []
        for rank, j in enumerate(order[: config.top_k], start=1):
            num = int(dom.values[j])
            positions = np.flatnonzero(idx == j)
            gaps = np.diff(positions)
            factors = {}
            for m, pm in probs.items():
                factors[m] = {
                    "prob": _r(pm[j]),
                    "lift_vs_reference": _r(pm[j] / base.probs[j]) if base.probs[j] > 0 else None,
                    "rank": int(model_ranks[m][j]),
                    "weight": _r(weights.get(m, 0) / wsum) if official == "ensemble" and m in weights else None,
                    "contribution": _r(weights.get(m, 0) / wsum * pm[j]) if official == "ensemble" and m in weights else None,
                }
            metrics = {
                "historical_count": int(counts[j]),
                "historical_freq": _r(counts[j] / n) if n else None,
                "recent_window": recent_w,
                "recent_count": int(recent_counts[j]),
                "recent_freq": _r(recent_counts[j] / min(n, recent_w)) if n else None,
                "weekday_count": int(wd_counts[j]),
                "weekday_draws": n_wd,
                "weekday_freq": _r(wd_counts[j] / n_wd) if n_wd else None,
                "month_count": int(month_counts[j]),
                "month_draws": n_month,
                "month_freq": _r(month_counts[j] / n_month) if n_month else None,
                "draws_since_last": int(n - 1 - positions[-1]) if len(positions) else None,
                "last_seen_date": dates[positions[-1]] if len(positions) else None,
                "gap_mean": _r(gaps.mean(), 4) if len(gaps) else None,
                "gap_median": _r(np.median(gaps), 4) if len(gaps) else None,
                "gap_max": int(gaps.max()) if len(gaps) else None,
                "expected_gap_under_reference": _r(1 / base.probs[j], 4) if base.probs[j] > 0 else None,
                "recurrence_hazard_ratio": _r(rec_ratio[j], 6) if rec_ratio is not None else None,
            }
            unc = _uncertainty(counts[j], n, float(base.probs[j]), st.alpha, p_bh[j] if not np.isnan(p_bh[j]) else None)
            candidates.append({
                "variable": var,
                "rank": rank,
                "number": num,
                "score": _r(p[j], 12),
                "reference_prob": _r(base.probs[j], 12),
                "lift": _r(p[j] / base.probs[j], 8) if base.probs[j] > 0 else None,
                "metrics": metrics,
                "factors": factors,
                "uncertainty": unc,
                "explanation": _explain(var, num, rank, p[j], base.probs[j], metrics, factors, official, unc),
            })
        nz = p[p > 0]
        entropy = float(-(nz * np.log(nz)).sum() / np.log(dom.size)) if dom.size > 1 else None
        possible = base.probs > 0
        variables[var] = {
            "label": VARIABLE_LABELS[var],
            "domain": {"min": int(dom.values[0]), "max": int(dom.values[-1]), "size": dom.size, "source": dom.source},
            "reference": {"theoretical": base.theoretical, "description": base.description},
            "n_history": n,
            "entropy_ratio": _r(entropy, 6),
            "max_lift": _r(float((p[possible] / base.probs[possible]).max()), 6),
            "candidates": candidates,
            "warnings": ctx.warnings(var),
        }
    combos: dict = {"available": False}
    try:
        main_probs = [official_probs[v] for v in MAIN_VARIABLES]
        values = ctx.main_domain.values
        main_base = [ctx.baselines[v].probs for v in MAIN_VARIABLES]
        top = top_combinations(main_probs, values, ctx.rules, config.combinations_count) if config.combinations_count else []
        for c in top:  # dato informativo: cuánto más probable la considera el modelo que el azar
            c["lift_vs_reference"] = float(np.prod([c["per_position_prob"][i] / main_base[i][int(x) - int(values[0])]
                                                     for i, x in enumerate(c["numbers"])]))
        sn_order = ranking(official_probs["sn"], ctx.domains["sn"].values)
        sn_best = int(ctx.domains["sn"].values[sn_order[0]])
        for c in top:
            c["super_number"] = sn_best
        combos = {
            "available": True,
            "method": "k-best exacto (A*) sobre Σ log puntaje por posición, respetando las reglas",
            "items": top,
            "independent_top1": independent_argmax(main_probs, values, ctx.rules),
            "note": "Bajo azar uniforme todas las combinaciones válidas son equiprobables.",
        }
    except CombinationError as e:
        combos = {"available": False, "reason": str(e)}
        warnings.append(f"Combinaciones no generadas: {e}")
    if not ctx.rules.fully_confirmed:
        warnings.append("Las reglas del juego no están completamente confirmadas.")
    if n < 100:
        warnings.append(f"Histórico corto (n={n}): los modelos se apoyan casi por completo en la referencia.")
    result = {
        "algorithm_version": ALGORITHM_VERSION,
        "target_date": target_date.isoformat(),
        "target_weekday": target.weekday,
        "official_model": official,
        "official_model_description": "Ensamble lineal de modelos" if official == "ensemble"
        else MODEL_DESCRIPTIONS[next(s.type for s in config.models if s.id == official)],
        "data_scope": window_info or {},
        "variables": variables,
        "combinations": combos,
        "warnings": warnings,
        "disclaimer": DISCLAIMER,
    }
    result["prediction_hash"] = prediction_hash(result)
    return result


def prediction_hash(result: dict) -> str:
    """Huella del contenido predictivo (ranking y puntajes), independiente de metadatos de ejecución."""
    core = {
        "algorithm_version": result["algorithm_version"],
        "target_date": result["target_date"],
        "official_model": result["official_model"],
        "candidates": {v: [(c["rank"], c["number"], round(c["score"], 10)) for c in d["candidates"]]
                       for v, d in result["variables"].items()},
        "combinations": [c["numbers"] for c in result["combinations"].get("items", [])],
    }
    return sha256_json(core)


def _pct(x: float | None) -> str:
    return "—" if x is None else f"{100 * x:.2f} %".replace(".", ",")


def _explain(var, num, rank, score, ref, m, factors, official, unc) -> list[str]:
    lines = [
        f"{VARIABLE_LABELS[var]}: el número {num} ocupa el puesto {rank} del modelo '{official}' con puntaje "
        f"{_pct(score)} frente a una probabilidad de referencia de {_pct(ref)} (×{score / ref:.3f})."
        .replace(f"×{score / ref:.3f}", f"×{score / ref:.3f}".replace(".", ",")),
        f"Frecuencia histórica en esta posición: {m['historical_count']} apariciones "
        f"({_pct(m['historical_freq'])}). Últimos {m['recent_window']} sorteos: {m['recent_count']} "
        f"({_pct(m['recent_freq'])}).",
    ]
    if m["weekday_draws"]:
        lines.append(f"En el mismo día de la semana: {m['weekday_count']} de {m['weekday_draws']} sorteos "
                     f"({_pct(m['weekday_freq'])}).")
    if m["draws_since_last"] is not None:
        lines.append(f"Sorteos desde su última aparición: {m['draws_since_last']} (intervalo medio "
                     f"{m['gap_mean']}, esperado bajo azar {m['expected_gap_under_reference']}). "
                     "Una ausencia larga no aumenta por sí misma la probabilidad.")
    if official == "ensemble":
        top = sorted(((k, f) for k, f in factors.items() if f.get("contribution") is not None),
                     key=lambda kv: -(kv[1]["lift_vs_reference"] or 0))[:3]
        lines.append("Modelos que más lo favorecen: " + ", ".join(
            f"{k} (×{f['lift_vs_reference']:.3f})" for k, f in top) + ".")
    lines.append(f"Incertidumbre {unc['level']}: {unc['explanation']}")
    return lines
