"""Predicción como se juega Baloto: 5 números en CUALQUIER orden + Súper Número.

La "posición" de un número es solo consecuencia de publicar los números ordenados; Baloto paga por
cuántos números aciertas, sin importar el orden. Por eso aquí cada número se evalúa por la proporción
de sorteos en los que apareció (en cualquier posición).

Modelos (deliberadamente pocos y simples, ver docs/STATISTICAL_ENGINE.md):
- ``frecuencia_historica``: proporción de sorteos con el número en toda la ventana.
- ``frecuencia_reciente``: lo mismo en los últimos N sorteos.
La referencia es el azar: todos los números igual de probables (5/43 por sorteo). Ambas frecuencias se suavizan hacia el azar (prior de Dirichlet): con pocos datos el modelo ES el azar.

El "puntaje" de un número es la proporción estimada por el modelo, NO una probabilidad demostrada
de que salga. El backtesting mide si estos modelos aciertan más que el azar.
"""
from __future__ import annotations

from datetime import date
from math import comb
from typing import Literal

import numpy as np
import pandas as pd
from pydantic import BaseModel, Field, model_validator
from scipy import stats

from app.engine import MAIN_VARIABLES
from app.engine.config import sha256_json
from app.engine.data import WindowSpec
from app.engine.odds import classify, match_probability, odds_table
from app.engine.rules import N_MAIN, GameRules

ALGORITHM_VERSION_NUMBERS = "2.0.0"
FORMAT = "numbers_v1"

MODEL_DESCRIPTIONS = {
    "frecuencia_historica": "Números que más veces han salido en todo el histórico seleccionado.",
    "frecuencia_reciente": "Números que más veces han salido en los últimos sorteos.",
}

DISCLAIMER = (
    "En un sorteo aleatorio todas las combinaciones tienen exactamente la misma probabilidad. "
    "Ningún método conocido acierta más que el azar con este histórico (ver '¿Cómo le ha ido?')."
)
OFFICIAL_DESCRIPTIONS = {
    "azar": "Combinación elegida al azar respetando las reglas. Las probabilidades mostradas son las "
            "reales y exactas del sorteo: la misma para cualquier combinación.",
    **MODEL_DESCRIPTIONS,
}


class NumbersConfig(BaseModel):
    format: Literal["numbers_v1"] = FORMAT
    official_model: Literal["azar", "frecuencia_historica", "frecuencia_reciente"] = "azar"
    recent_window: int = Field(100, ge=5, le=5000)
    prior_strength: float = Field(43.0, ge=0, description="Sorteos ficticios de 'azar' que suavizan la estimación")
    top_main: int = Field(10, ge=5, le=43)
    top_super: int = Field(5, ge=1, le=16)
    data_scope: WindowSpec = Field(default_factory=WindowSpec)
    backtest_min_train: int = Field(100, ge=10)

    @model_validator(mode="after")
    def _check(self):
        return self


def default_numbers_config() -> NumbersConfig:
    return NumbersConfig()


def config_hash(cfg: NumbersConfig) -> str:
    return sha256_json(cfg.model_dump(mode="json"))


# ------------------------------------------------------------------ utilidades
def _domains(rules: GameRules) -> tuple[np.ndarray, np.ndarray]:
    return np.arange(rules.main_min, rules.main_max + 1), np.arange(rules.super_min, rules.super_max + 1)


def inclusion_matrix(frame: pd.DataFrame, values: np.ndarray) -> np.ndarray:
    """occ[t, j] = 1 si el número values[j] salió (en cualquier posición) en el sorteo t."""
    lo = int(values[0])
    occ = np.zeros((len(frame), len(values)), dtype=np.int8)
    main = frame[list(MAIN_VARIABLES)].to_numpy() - lo
    for col in main.T:
        ok = (col >= 0) & (col < len(values))
        occ[np.arange(len(frame))[ok], col[ok]] = 1
    return occ


def super_matrix(frame: pd.DataFrame, values: np.ndarray) -> np.ndarray:
    lo = int(values[0])
    occ = np.zeros((len(frame), len(values)), dtype=np.int8)
    col = frame["sn"].to_numpy() - lo
    ok = (col >= 0) & (col < len(values))
    occ[np.arange(len(frame))[ok], col[ok]] = 1
    return occ


def model_scores(occ: np.ndarray, picks: int, model: str, cfg: NumbersConfig) -> np.ndarray:
    """Proporción estimada de sorteos que contienen cada número (suma = picks)."""
    D = occ.shape[1]
    ref = picks / D
    if len(occ) == 0:
        return np.full(D, ref)
    rows = occ if model == "frecuencia_historica" else occ[-cfg.recent_window:]
    n = len(rows)
    a = cfg.prior_strength
    return (rows.sum(axis=0) + a * ref) / (n + a)


def rank_order(scores: np.ndarray, values: np.ndarray) -> np.ndarray:
    """Mayor puntaje primero; empate → número menor primero (determinista)."""
    return np.lexsort((values, -np.round(scores, 12)))


def _uncertainty(count: int, n: int, ref: float, alpha: float, p_adjusted: float, n_numbers: int) -> dict:
    """Rango creíble 90 % de la proporción real y veredicto CONSIDERANDO todos los números a la vez:
    entre muchos números, algunos siempre salen bastante más que el promedio por pura suerte."""
    a, b = count + alpha * ref, (n - count) + alpha * (1 - ref)
    lo, hi = stats.beta.ppf([0.05, 0.95], a, b)
    compatible = bool(p_adjusted >= 0.05)
    return {
        "range_90": [round(float(lo), 6), round(float(hi), 6)],
        "p_value_adjusted": round(float(p_adjusted), 6),
        "compatible_with_chance": compatible,
        "text": (f"Entre {n_numbers} números es normal que algunos salgan más que el promedio por pura suerte; "
                 "teniendo eso en cuenta, su frecuencia es compatible con el azar."
                 if compatible else
                 f"Incluso considerando los {n_numbers} números a la vez, su frecuencia se aparta de lo esperado "
                 "por azar en este histórico. Eso no garantiza que se repita (ver '¿Cómo le ha ido?')."),
    }


def _pct(x: float) -> str:
    return f"{100 * x:.1f} %".replace(".", ",")


def _candidates(occ: np.ndarray, values: np.ndarray, picks: int, cfg: NumbersConfig, dates: list[str],
                top: int, kind: str, rng: np.random.Generator | None = None) -> tuple[list[dict], np.ndarray]:
    n, D = occ.shape
    ref = picks / D
    scores = {m: model_scores(occ, picks, m, cfg) for m in MODEL_DESCRIPTIONS}
    if cfg.official_model == "azar":
        # probabilidad real y exacta: la misma para todos; selección aleatoria reproducible
        official = np.full(D, ref)
        order = np.sort(rng.choice(D, picks, replace=False))
        top = picks
    else:
        official = scores[cfg.official_model]
        order = rank_order(official, values)
    counts = occ.sum(axis=0)
    w = min(cfg.recent_window, n)
    recent = occ[-w:].sum(axis=0) if n else np.zeros(D)
    from app.engine.stats_utils import adjust_pvalues

    pv = np.array([stats.binomtest(int(c), n, ref).pvalue if n else 1.0 for c in counts])
    p_adj = adjust_pvalues(pv, "fdr_bh")
    out = []
    for rank, j in enumerate(order[:top], start=1):
        seen = np.flatnonzero(occ[:, j])
        gaps = np.diff(seen)
        since = int(n - 1 - seen[-1]) if len(seen) else None
        num = int(values[j])
        m = {
            "times_drawn": int(counts[j]),
            "draws": n,
            "share": round(float(counts[j] / n), 6) if n else None,
            "expected_times_by_chance": round(n * ref, 2),
            "recent_window": w,
            "recent_times": int(recent[j]),
            "recent_expected_by_chance": round(w * ref, 2),
            "draws_since_last": since,
            "last_seen_date": dates[seen[-1]] if len(seen) else None,
            "average_gap": round(float(gaps.mean()), 2) if len(gaps) else None,
            "expected_gap_by_chance": round(1 / ref, 2),
        }
        unc = _uncertainty(int(counts[j]), n, ref, cfg.prior_strength, float(p_adj[j]), D)
        name = "superbalota" if kind == "sn" else "número"
        lines = [f"Elegido al azar. Su probabilidad real de salir en el próximo sorteo es {_pct(ref)}, "
                 f"exactamente igual que la de cualquier {'otra' if kind == 'sn' else 'otro'} {name}."] \
            if cfg.official_model == "azar" else []
        lines += [
            f"El {name} {num} salió {m['times_drawn']} veces en {n} sorteos ({_pct(m['share'] or 0)}); "
            f"por puro azar se esperarían {str(m['expected_times_by_chance']).replace('.', ',')} veces.",
            f"En los últimos {w} sorteos salió {m['recent_times']} veces (azar: "
            f"{str(m['recent_expected_by_chance']).replace('.', ',')}).",
        ]
        if since == 0:
            lines.append("Salió en el último sorteo. Haber salido recién no lo hace más ni menos probable.")
        elif since is not None:
            lines.append(f"No sale desde hace {since} sorteo{'s' if since != 1 else ''} (en promedio pasan "
                         f"{str(m['expected_gap_by_chance']).replace('.', ',')} sorteos entre apariciones). "
                         "Que lleve tiempo sin salir no lo hace más probable.")
        lines.append(unc["text"])
        out.append({
            "rank": rank, "number": num, "score": round(float(official[j]), 10),
            "reference": round(ref, 10), "lift": round(float(official[j] / ref), 6),
            "model_scores": {k: round(float(v[j]), 10) for k, v in scores.items()},
            "metrics": m, "uncertainty": unc, "explanation": lines,
        })
    return out, official


def selection_seed(seed_key: str, target_date: date) -> int:
    """Semilla reproducible (y registrada) para la selección al azar: mismo juego y fecha ⇒ misma combinación."""
    import hashlib

    return int.from_bytes(hashlib.sha256(f"{seed_key}|{target_date.isoformat()}".encode()).digest()[:8], "big")


def predict_numbers(frame: pd.DataFrame, rules: GameRules, cfg: NumbersConfig, target_date: date,
                    prize_categories: list[dict] | None, data_scope: dict | None = None,
                    seed_key: str = "default") -> dict:
    if not (rules.main_range_known and rules.super_range_known):
        raise ValueError("Se requieren los rangos de números confirmados en las reglas del juego.")
    if len(frame) and frame["draw_date"].max() >= pd.Timestamp(target_date):
        raise ValueError("El conjunto de datos contiene sorteos en o después de la fecha objetivo (leakage).")
    main_vals, sn_vals = _domains(rules)
    dates = frame["draw_date"].dt.date.astype(str).tolist()
    occ_m, occ_s = inclusion_matrix(frame, main_vals), super_matrix(frame, sn_vals)
    seed = selection_seed(seed_key, target_date)
    rng = np.random.default_rng(seed)
    main_c, main_scores = _candidates(occ_m, main_vals, N_MAIN, cfg, dates, cfg.top_main, "main", rng)
    sn_c, sn_scores = _candidates(occ_s, sn_vals, 1, cfg, dates, cfg.top_super, "sn", rng)
    suggested = sorted(c["number"] for c in main_c[:N_MAIN])
    warnings = []
    if len(frame) < 100:
        warnings.append(f"Histórico corto ({len(frame)} sorteos): las frecuencias son muy inestables.")
    result = {
        "format": FORMAT,
        "algorithm_version": ALGORITHM_VERSION_NUMBERS,
        "target_date": target_date.isoformat(),
        "official_model": cfg.official_model,
        "official_model_description": OFFICIAL_DESCRIPTIONS[cfg.official_model],
        "selection_seed": seed if cfg.official_model == "azar" else None,
        "suggested": {"numbers": suggested, "super_number": sn_c[0]["number"]},
        "main": {"candidates": main_c, "reference": N_MAIN / len(main_vals)},
        "super": {"candidates": sn_c, "reference": 1 / len(sn_vals)},
        "odds": odds_table(rules, prize_categories),
        "data_scope": data_scope or {"n_draws": len(frame)},
        "warnings": warnings,
        "disclaimer": DISCLAIMER,
    }
    result["prediction_hash"] = sha256_json({
        "v": ALGORITHM_VERSION_NUMBERS, "t": result["target_date"], "m": cfg.official_model,
        "main": [(c["rank"], c["number"], round(c["score"], 8)) for c in main_c],
        "sn": [(c["rank"], c["number"], round(c["score"], 8)) for c in sn_c], "s": result["suggested"]})
    return result


# ------------------------------------------------------------------ backtesting "como se juega"
def _sum_of_matches_sf(observed: int, n_draws: int, D: int) -> float:
    """P(suma de aciertos >= observado) si cada sorteo es independiente (convolución exacta)."""
    pmf = np.array([match_probability(D, k) for k in range(N_MAIN + 1)])
    dist = np.array([1.0])
    for _ in range(n_draws):
        dist = np.convolve(dist, pmf)
    return float(np.clip(dist[observed:].sum(), 0, 1))


def backtest_numbers(frame: pd.DataFrame, rules: GameRules, cfg: NumbersConfig, start_index: int,
                     prize_categories: list[dict] | None, seed: int = 20240101) -> dict:
    """Walk-forward: para cada sorteo, el sistema elige 5 números + superbalota usando SOLO los sorteos
    anteriores; se cuentan aciertos y categorías de premio, y se compara con el azar."""
    main_vals, sn_vals = _domains(rules)
    D, S = len(main_vals), len(sn_vals)
    occ_m, occ_s = inclusion_matrix(frame, main_vals), super_matrix(frame, sn_vals)
    n = len(frame)
    if start_index < 1 or start_index >= n:
        raise ValueError("Se necesitan más sorteos que el mínimo de entrenamiento")
    rng = np.random.default_rng(seed)
    strategies = list(MODEL_DESCRIPTIONS) + ["azar"]  # 'azar' = combinación aleatoria con semilla registrada
    acc = {s: {"matches": [], "sn": [], "categories": {}} for s in strategies}
    per_draw = []
    dates = frame["draw_date"].dt.date.astype(str).tolist()
    for t in range(start_index, n):
        actual = set(np.flatnonzero(occ_m[t]))
        actual_sn = int(np.flatnonzero(occ_s[t])[0]) if occ_s[t].any() else -1
        row = {"date": dates[t], "actual": sorted(int(main_vals[j]) for j in actual),
               "actual_sn": int(sn_vals[actual_sn]) if actual_sn >= 0 else None, "strategies": {}}
        for s in strategies:
            if s == "azar":
                pick = set(rng.choice(D, N_MAIN, replace=False).tolist())
                pick_sn = int(rng.integers(S))
            else:
                sm = model_scores(occ_m[:t], N_MAIN, s, cfg)
                ss = model_scores(occ_s[:t], 1, s, cfg)
                pick = set(rank_order(sm, main_vals)[:N_MAIN].tolist())
                pick_sn = int(rank_order(ss, sn_vals)[0])
            k = len(pick & actual)
            hit = pick_sn == actual_sn
            cat = classify(k, hit, prize_categories)
            a = acc[s]
            a["matches"].append(k)
            a["sn"].append(int(hit))
            if cat:
                a["categories"][cat] = a["categories"].get(cat, 0) + 1
            row["strategies"][s] = {"numbers": sorted(int(main_vals[j]) for j in pick),
                                    "super_number": int(sn_vals[pick_sn]), "matches": k, "super_hit": hit,
                                    "category": cat}
        per_draw.append(row)
    T = len(per_draw)
    exp_matches = N_MAIN * N_MAIN / D
    odds = odds_table(rules, prize_categories)
    summary_rows = []
    pvals = []
    for s in strategies:
        a = acc[s]
        total = int(np.sum(a["matches"]))
        sn_hits = int(np.sum(a["sn"]))
        p_m = _sum_of_matches_sf(total, T, D)
        p_s = float(stats.binom.sf(sn_hits - 1, T, 1 / S))
        dist = np.bincount(a["matches"], minlength=N_MAIN + 1).tolist()
        cats = []
        for c in (odds.get("categories") or []):
            cats.append({"label": c["label"], "times": a["categories"].get(c["label"], 0),
                         "expected_by_chance": round(T * c["probability"], 2)})
        summary_rows.append({
            "strategy": s, "draws": T,
            "average_matches": round(total / T, 4), "expected_average_by_chance": round(exp_matches, 4),
            "matches_distribution": dist,
            "matches_distribution_expected": [round(T * match_probability(D, k), 2) for k in range(N_MAIN + 1)],
            "super_hits": sn_hits, "super_hits_expected_by_chance": round(T / S, 2),
            "prize_categories": cats,
            "draws_with_prize": int(sum(x["times"] for x in cats)),
            "draws_with_prize_expected": round(T * (odds.get("any_prize_probability") or 0), 2),
            "p_value_matches": p_m, "p_value_super": p_s,
        })
        if s != "azar":
            pvals += [p_m, p_s]
    # Holm sobre las estrategias de modelo
    from app.engine.stats_utils import adjust_pvalues

    adj = adjust_pvalues(np.array(pvals), "holm") if pvals else []
    i = 0
    for r in summary_rows:
        if r["strategy"] == "azar":
            r["verdict"] = "referencia"
            r["plain"] = (
                f"Jugando una combinación al azar en cada uno de los {T} sorteos, se acertaron en promedio "
                f"{str(r['average_matches']).replace('.', ',')} números (lo teórico es "
                f"{str(round(exp_matches, 2)).replace('.', ',')}) y la superbalota {r['super_hits']} veces "
                f"(teórico: {str(r['super_hits_expected_by_chance']).replace('.', ',')}).")
            continue
        r["p_holm_matches"], r["p_holm_super"] = float(adj[i]), float(adj[i + 1])
        i += 2
        better = r["p_holm_matches"] < 0.05 or r["p_holm_super"] < 0.05
        r["verdict"] = "mejor_que_el_azar" if better else "igual_que_el_azar"
        r["plain"] = (
            f"En {T} sorteos acertó en promedio {str(r['average_matches']).replace('.', ',')} números "
            f"(el azar acierta {str(round(exp_matches, 2)).replace('.', ',')}) y la superbalota {r['super_hits']} "
            f"veces (azar: {str(r['super_hits_expected_by_chance']).replace('.', ',')}). "
            + ("Esta diferencia es estadísticamente significativa."
               if better else "La diferencia es la que se espera por pura suerte: no supera al azar.")
        )
    official = next(r for r in summary_rows if r["strategy"] == cfg.official_model)
    any_better = any(r.get("verdict") == "mejor_que_el_azar" for r in summary_rows)
    return {
        "format": FORMAT,
        "draws": T, "first_date": per_draw[0]["date"], "last_date": per_draw[-1]["date"],
        "min_train": start_index, "seed": seed,
        "strategies": summary_rows, "official_strategy": cfg.official_model,
        "headline": official.get("plain") or "",
        "conclusion": ("Algún método supera al azar en este periodo; verifique que se mantenga en el tiempo."
                       if any_better else
                       "Ningún método supera al azar: los aciertos del sistema son los que se esperan por suerte."),
        "per_draw": per_draw,
    }
