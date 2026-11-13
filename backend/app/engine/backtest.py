"""Backtesting cronológico walk-forward.

Para cada sorteo objetivo t (en orden cronológico) los modelos predicen usando SOLO los sorteos
0..t-1; después el sorteo t se incorpora al estado. Métricas por modelo y variable:

- Aciertos top-k y su p-valor exacto frente al azar: bajo la hipótesis nula (sorteo con la
  distribución de referencia), la probabilidad de acierto en t es la suma de las probabilidades de
  referencia de los k números elegidos ⇒ el total de aciertos es Poisson-binomial.
- Log loss y Brier frente al modelo de referencia, con prueba t pareada unilateral.
- Calibración (diagrama de fiabilidad y ECE).
- Corrección de Holm sobre todas las pruebas (modelos × variables).
- Línea base aleatoria simulada con semilla registrada (respeta exactamente las reglas).
"""
from __future__ import annotations

from collections import defaultdict

import numpy as np
import pandas as pd
from scipy import stats

from app.engine import MAIN_VARIABLES, VARIABLES
from app.engine.combinations import CombinationError, can_build, independent_argmax, random_valid_combination, top_combinations
from app.engine.config import EngineConfig
from app.engine.context import AnalysisContext
from app.engine.models import Target, VariableState, ranking
from app.engine.stats_utils import adjust_pvalues, poisson_binomial_sf, safe_float

CAL_BINS = np.array([0, 0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.08, 0.1, 0.15, 0.2, 0.3, 1.0000001])


def run_backtest(frame: pd.DataFrame, ctx: AnalysisContext, config: EngineConfig, start_index: int,
                 end_index: int | None = None, top_ks: list[int] | None = None, seed: int = 20240101,
                 evaluate_combinations: bool = True, progress=None) -> dict:
    top_ks = sorted(set(top_ks or config.backtest.top_ks))
    n = len(frame)
    end_index = n if end_index is None else min(end_index, n)
    if start_index < 1 or start_index >= end_index:
        raise ValueError("Rango de backtesting inválido: se requiere 1 <= inicio < fin")
    rng = np.random.default_rng(seed)
    model_ids = config.model_ids()
    base_id = config.baseline_id()
    wds = frame["weekday"].to_numpy()
    months = frame["draw_date"].dt.month.to_numpy()
    years = frame["draw_date"].dt.year.to_numpy()
    dates = frame["draw_date"].dt.date.astype(str).to_numpy()
    draw_ids = frame["draw_id"].to_numpy()
    states = {v: VariableState(ctx.domains[v].size, ctx.baselines[v].probs, config) for v in VARIABLES}
    idx = {v: ctx.domains[v].index_of(frame[v].to_numpy()) for v in VARIABLES}
    acc = {m: {v: defaultdict(list) for v in VARIABLES} for m in model_ids}
    random_hits = {v: {k: 0 for k in top_ks} for v in VARIABLES}
    cal = {m: {v: np.zeros((3, len(CAL_BINS) - 1)) for v in VARIABLES} for m in model_ids}
    per_target: list[dict] = []
    combo_rows: list[dict] = []
    combos_ok, combos_reason = can_build(ctx.rules)
    for t in range(end_index):
        if t >= start_index:
            target = Target(int(wds[t]), int(months[t]))
            row = {"t": t, "draw_id": int(draw_ids[t]), "date": dates[t], "weekday": int(wds[t]),
                   "year": int(years[t]), "models": {}}
            official_probs = {}
            for v in VARIABLES:
                dom, base = ctx.domains[v], ctx.baselines[v].probs
                actual = int(idx[v][t])
                probs = states[v].predict_all(config, target)
                if actual < 0:
                    continue
                onehot = np.zeros(dom.size)
                onehot[actual] = 1
                # azar simulado (semilla registrada): ranking aleatorio según la referencia
                rnd = rng.choice(dom.size, size=max(top_ks), replace=False, p=base)
                for k in top_ks:
                    random_hits[v][k] += int(actual in rnd[:k])
                for m, p in probs.items():
                    order = ranking(p, dom.values)
                    rank_actual = int(np.flatnonzero(order == actual)[0]) + 1
                    a = acc[m][v]
                    a["rank"].append(rank_actual)
                    a["p_actual"].append(float(p[actual]))
                    a["logloss"].append(float(-np.log(max(p[actual], 1e-300))))
                    a["brier"].append(float(((p - onehot) ** 2).sum()))
                    a["weekday"].append(int(wds[t]))
                    a["year"].append(int(years[t]))
                    for k in top_ks:
                        a[f"hit{k}"].append(int(rank_actual <= k))
                        a[f"null{k}"].append(float(base[order[:k]].sum()))
                    b = np.clip(np.digitize(p, CAL_BINS) - 1, 0, len(CAL_BINS) - 2)
                    np.add.at(cal[m][v][0], b, p)
                    np.add.at(cal[m][v][1], b, onehot)
                    np.add.at(cal[m][v][2], b, 1)
                    row["models"].setdefault(m, {})[v] = {"rank": rank_actual, "p": round(float(p[actual]), 8)}
                    if m == config.official_model:
                        official_probs[v] = p
            if evaluate_combinations and combos_ok and len(official_probs) == 6:
                combo_rows.append(_combo_eval(frame, t, official_probs, ctx, rng))
            per_target.append(row)
            if progress and (t - start_index) % 50 == 0:
                progress(t - start_index, end_index - start_index)
        for v in VARIABLES:
            states[v].update(int(idx[v][t]), int(wds[t]), int(months[t]))
    summary = _summarize(acc, cal, random_hits, top_ks, model_ids, base_id, ctx)
    summary["combinations"] = _summarize_combos(combo_rows) if combo_rows else {
        "available": False, "reason": combos_reason or "No evaluado"}
    summary["n_targets"] = len(per_target)
    summary["first_target_date"] = per_target[0]["date"] if per_target else None
    summary["last_target_date"] = per_target[-1]["date"] if per_target else None
    summary["min_train"] = start_index
    summary["seed"] = seed
    summary["top_ks"] = top_ks
    return {"summary": summary, "per_target": per_target}


def _combo_eval(frame, t, official_probs, ctx, rng) -> dict:
    values = ctx.main_domain.values
    main_probs = [official_probs[v] for v in MAIN_VARIABLES]
    actual = [int(frame[v].iloc[t]) for v in MAIN_VARIABLES]
    actual_set = set(actual)
    try:
        best = top_combinations(main_probs, values, ctx.rules, 1)[0]["numbers"]
    except CombinationError:
        best = None
    ind = independent_argmax(main_probs, values, ctx.rules)
    rnd = random_valid_combination(ctx.rules, rng)

    def score(c):
        if c is None:
            return None
        return {"positions": int(sum(a == b for a, b in zip(c, actual))), "numbers": len(set(c) & actual_set)}

    return {"joint": score(best), "independent": score(ind["numbers"]), "independent_valid": ind["valid"],
            "random": score(rnd)}


def _summarize_combos(rows: list[dict]) -> dict:
    out = {"available": True, "n": len(rows)}
    for key in ("joint", "independent", "random"):
        pos = np.array([r[key]["positions"] for r in rows if r[key]])
        num = np.array([r[key]["numbers"] for r in rows if r[key]])
        out[key] = {
            "mean_position_matches": safe_float(pos.mean()) if len(pos) else None,
            "mean_number_matches": safe_float(num.mean()) if len(num) else None,
            "distribution_number_matches": np.bincount(num, minlength=6).tolist() if len(num) else None,
        }
    out["independent_invalid_share"] = safe_float(np.mean([not r["independent_valid"] for r in rows]))
    j = np.array([r["joint"]["numbers"] for r in rows if r["joint"]])
    rd = np.array([r["random"]["numbers"] for r in rows if r["joint"]])
    if len(j) > 1 and np.std(j - rd) > 0:
        tstat, p = stats.ttest_rel(j, rd, alternative="greater")
        out["joint_vs_random_p_value"] = safe_float(p)
    else:
        out["joint_vs_random_p_value"] = None
    return out


def _group_rates(a: dict, key: str, k: int) -> list[dict]:
    groups = defaultdict(list)
    for g, h, ll in zip(a[key], a[f"hit{k}"], a["logloss"]):
        groups[g].append((h, ll))
    return [{"group": g, "n": len(v), f"top{k}_rate": safe_float(np.mean([x[0] for x in v])),
             "mean_logloss": safe_float(np.mean([x[1] for x in v]))} for g, v in sorted(groups.items())]


def _summarize(acc, cal, random_hits, top_ks, model_ids, base_id, ctx: AnalysisContext) -> dict:
    kmain = max(top_ks)
    rows = []
    for m in model_ids:
        for v in VARIABLES:
            a = acc[m][v]
            nt = len(a["rank"])
            if nt == 0:
                continue
            base_ll = np.array(acc[base_id][v]["logloss"])
            ll = np.array(a["logloss"])
            diff = ll - base_ll
            if m == base_id or np.allclose(diff, 0):
                p_ll = None
            else:
                p_ll = safe_float(stats.ttest_1samp(diff, 0.0, alternative="less").pvalue) if nt > 1 else None
            topk = {}
            for k in top_ks:
                hits = int(np.sum(a[f"hit{k}"]))
                nulls = np.array(a[f"null{k}"])
                topk[str(k)] = {
                    "hits": hits,
                    "rate": safe_float(hits / nt),
                    "expected_under_null": safe_float(nulls.sum()),
                    "expected_rate_under_null": safe_float(nulls.mean()),
                    "p_value": poisson_binomial_sf(hits, nulls),
                    "random_baseline_hits": random_hits[v][k],
                }
            c = cal[m][v]
            mask = c[2] > 0
            mean_pred = np.where(mask, c[0] / np.maximum(c[2], 1), np.nan)
            obs = np.where(mask, c[1] / np.maximum(c[2], 1), np.nan)
            ece = float(np.nansum(np.abs(mean_pred - obs) * c[2]) / c[2].sum()) if c[2].sum() else None
            rows.append({
                "model": m,
                "variable": v,
                "n_targets": nt,
                "top_k": topk,
                "mean_rank": safe_float(np.mean(a["rank"])),
                "expected_rank_uniform": safe_float((ctx.domains[v].size + 1) / 2),
                "mean_logloss": safe_float(ll.mean()),
                "baseline_logloss": safe_float(base_ll.mean()),
                "logloss_diff": safe_float(diff.mean()),
                "logloss_p_value": p_ll,
                "mean_brier": safe_float(np.mean(a["brier"])),
                "baseline_brier": safe_float(np.mean(acc[base_id][v]["brier"])),
                "calibration": {
                    "bins": [[safe_float(CAL_BINS[i]), safe_float(min(CAL_BINS[i + 1], 1.0))] for i in range(len(CAL_BINS) - 1)],
                    "mean_predicted": [safe_float(x) for x in mean_pred],
                    "observed_freq": [safe_float(x) for x in obs],
                    "count": c[2].astype(int).tolist(),
                    "ece": safe_float(ece),
                },
                "by_weekday": _group_rates(a, "weekday", kmain),
                "by_year": _group_rates(a, "year", kmain),
            })
    # Holm sobre todas las pruebas de modelos no-referencia
    tests = [(i, "logloss_p_value") for i, r in enumerate(rows) if r["logloss_p_value"] is not None]
    tests += [(i, f"top{kmain}") for i, r in enumerate(rows) if r["model"] != base_id]
    pv = np.array([rows[i]["logloss_p_value"] if key == "logloss_p_value" else rows[i]["top_k"][str(kmain)]["p_value"]
                   for i, key in tests], dtype=float)
    adj = adjust_pvalues(pv, "holm") if len(pv) else np.array([])
    for (i, key), q in zip(tests, adj):
        if key == "logloss_p_value":
            rows[i]["logloss_p_holm"] = safe_float(q)
        else:
            rows[i]["top_k"][str(kmain)]["p_holm"] = safe_float(q)
    for r in rows:
        if r["model"] == base_id:
            r["verdict"] = "referencia"
            continue
        ll_ok = (r.get("logloss_p_holm") or 1) < 0.05
        hit_ok = (r["top_k"][str(kmain)].get("p_holm") or 1) < 0.05
        r["verdict"] = ("mejora_significativa" if ll_ok and hit_ok else
                        "evidencia_parcial" if ll_ok or hit_ok else "sin_mejora_significativa")
    overall = {}
    for m in model_ids:
        mr = [r for r in rows if r["model"] == m]
        overall[m] = {
            "mean_logloss_diff": safe_float(np.mean([r["logloss_diff"] for r in mr])) if mr else None,
            "variables_with_significant_improvement": sum(r["verdict"] == "mejora_significativa" for r in mr),
        }
    any_sig = any(r["verdict"] == "mejora_significativa" for r in rows)
    return {
        "rows": rows,
        "overall": overall,
        "multiple_testing": {"method": "holm", "n_tests": int(len(pv))},
        "conclusion": (
            "Al menos un modelo mejora significativamente a la referencia en alguna variable (tras Holm). "
            "Verifique estabilidad en otros periodos antes de confiar en ello."
            if any_sig else
            "Ningún modelo supera de forma estadísticamente significativa a la línea base aleatoria tras "
            "corregir por comparaciones múltiples. Los resultados son compatibles con sorteos independientes."
        ),
    }
