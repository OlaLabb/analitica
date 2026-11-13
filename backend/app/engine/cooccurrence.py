"""Coocurrencias, combinaciones, repeticiones entre sorteos, transiciones y relaciones entre posiciones.

Una coocurrencia frecuente es una descripción del pasado, no una relación causal ni evidencia
predictiva. Las pruebas por par se corrigen por comparaciones múltiples (Benjamini-Hochberg).
"""
from __future__ import annotations

from collections import Counter
from itertools import combinations

import numpy as np
import pandas as pd
from scipy import stats

from app.engine import MAIN_VARIABLES, VARIABLE_LABELS
from app.engine.context import AnalysisContext
from app.engine.rules import N_MAIN, pair_probability, pooled_main_probability
from app.engine.stats_utils import adjust_pvalues, chi2_homogeneity, safe_float


def _main_sets(frame: pd.DataFrame) -> list[tuple[int, ...]]:
    return [tuple(sorted(set(map(int, r)))) for r in frame[list(MAIN_VARIABLES)].to_numpy()]


def pair_analysis(frame: pd.DataFrame, ctx: AnalysisContext, top: int = 25) -> dict:
    d = ctx.main_domain
    sets = _main_sets(frame)
    n = len(sets)
    counter: Counter = Counter()
    for s in sets:
        counter.update(combinations(s, 2))
    p_pair, theoretical = pair_probability(ctx.rules, d)
    expected = n * p_pair
    all_pairs = list(combinations(d.values.astype(int).tolist(), 2))
    obs = np.array([counter.get(p, 0) for p in all_pairs], dtype=float)
    p_hi = stats.poisson.sf(obs - 1, expected) if expected > 0 else np.full(len(obs), np.nan)
    p_lo = stats.poisson.cdf(obs, expected) if expected > 0 else np.full(len(obs), np.nan)
    p_two = np.minimum(1.0, 2 * np.minimum(p_hi, p_lo))
    adj = adjust_pvalues(p_two, "fdr_bh")
    order = np.lexsort((np.arange(len(obs)), -obs))
    rows = lambda idxs: [{  # noqa: E731
        "pair": list(all_pairs[i]), "count": int(obs[i]), "expected": safe_float(expected),
        "p_value_bh": safe_float(adj[i]), "significant_bh_05": bool(adj[i] < 0.05) if not np.isnan(adj[i]) else False,
    } for i in idxs]
    D = d.size
    matrix = np.zeros((D, D), dtype=int)
    for (a, b), c in counter.items():
        ia, ib = a - int(d.values[0]), b - int(d.values[0])
        if 0 <= ia < D and 0 <= ib < D:
            matrix[ia, ib] = matrix[ib, ia] = c
    warnings = list(d.warnings)
    if not theoretical:
        warnings.append("Frecuencia esperada calculada suponiendo números sin repetición (no confirmado).")
    if expected < 5:
        warnings.append(f"Frecuencia esperada por par = {expected:.2f} (< 5): los conteos de pares son muy ruidosos.")
    return {
        "n_draws": n,
        "expected_per_pair": safe_float(expected),
        "n_pairs": len(all_pairs),
        "n_significant_bh": int(np.nansum(adj < 0.05)),
        "most_frequent": rows(order[:top]),
        "least_frequent": rows(order[::-1][:top]),
        "matrix": {"numbers": d.values.astype(int).tolist(), "counts": matrix.tolist()},
        "warnings": warnings,
    }


def frequent_groups(frame: pd.DataFrame, size: int = 3, top: int = 20) -> dict:
    counter: Counter = Counter()
    for s in _main_sets(frame):
        counter.update(combinations(s, size))
    items = sorted(counter.items(), key=lambda kv: (-kv[1], kv[0]))[:top]
    return {"size": size, "n_draws": len(frame), "groups": [{"numbers": list(k), "count": v} for k, v in items],
            "n_distinct_groups_observed": len(counter)}


def consecutive_repeats(frame: pd.DataFrame, ctx: AnalysisContext, max_lag: int = 10) -> dict:
    """Números compartidos entre un sorteo y el sorteo ``lag`` posiciones antes."""
    sets = [set(s) for s in _main_sets(frame)]
    sn = frame["sn"].to_numpy()
    d = ctx.main_domain
    p0, theoretical = pooled_main_probability(ctx.rules, d)
    lags = []
    for lag in range(1, max_lag + 1):
        shared = [len(sets[t] & sets[t - lag]) for t in range(lag, len(sets))]
        if not shared:
            break
        lags.append({"lag": lag, "n": len(shared), "mean_shared": safe_float(np.mean(shared)),
                     "expected_mean_shared": safe_float(N_MAIN * p0),
                     "sn_repeat_rate": safe_float(np.mean(sn[lag:] == sn[:-lag]))})
    dist = None
    if len(sets) > 1:
        shared1 = [len(sets[t] & sets[t - 1]) for t in range(1, len(sets))]
        observed = np.bincount(shared1, minlength=N_MAIN + 1)[: N_MAIN + 1]
        expected = None
        if theoretical and ctx.rules.main_unique:
            expected = (stats.hypergeom.pmf(np.arange(N_MAIN + 1), d.size, N_MAIN, N_MAIN) * len(shared1)).tolist()
        dist = {"shared": list(range(N_MAIN + 1)), "observed": observed.tolist(),
                "expected": [safe_float(x) for x in expected] if expected else None}
    sn_dom = ctx.domains["sn"]
    return {"lags": lags, "lag1_distribution": dist,
            "sn_expected_repeat_rate": safe_float(1 / sn_dom.size) if sn_dom.source == "rules" else None,
            "warnings": [] if theoretical else ["Valor esperado no confirmado por reglas."]}


def transition_analysis(frame: pd.DataFrame, var: str, ctx: AnalysisContext) -> dict:
    """Matriz de transición x_{t-1} → x_t y prueba de independencia."""
    domain = ctx.domains[var]
    idx = domain.index_of(frame[var].to_numpy())
    D = domain.size
    mat = np.zeros((D, D))
    for a, b in zip(idx[:-1], idx[1:]):
        if a >= 0 and b >= 0:
            mat[a, b] += 1
    test = chi2_homogeneity(mat) if len(frame) > 2 else None
    n_trans = int(mat.sum())
    warnings = list(ctx.warnings(var))
    if n_trans < 5 * D * D:
        warnings.append(
            f"Hay {n_trans} transiciones para {D*D} celdas: la matriz es dispersa y la prueba es solo orientativa."
        )
    return {"variable": var, "label": VARIABLE_LABELS[var], "numbers": domain.values.astype(int).tolist(),
            "matrix": mat.astype(int).tolist(), "n_transitions": n_trans, "independence_test": test,
            "warnings": warnings}


def position_relations(frame: pd.DataFrame, ctx: AnalysisContext) -> dict:
    cols = list(MAIN_VARIABLES) + ["sn"]
    if len(frame) < 3:
        return {"variables": cols, "spearman": None, "p_values": None, "warnings": ["Datos insuficientes"]}
    rho, p = stats.spearmanr(frame[cols].to_numpy())
    rho = np.atleast_2d(rho)
    p = np.atleast_2d(p)
    iu = np.triu_indices(len(cols), 1)
    adj = np.full_like(p, np.nan)
    adj[iu] = adjust_pvalues(p[iu], "holm")
    warnings = []
    if ctx.rules.main_order == "sorted_asc":
        warnings.append("Las posiciones están ordenadas: la correlación positiva entre posiciones es "
                        "consecuencia del ordenamiento, no un patrón del sorteo.")
    return {"variables": cols, "spearman": [[safe_float(x) for x in r] for r in rho],
            "p_values_holm": [[safe_float(x) for x in r] for r in adj], "warnings": warnings}
