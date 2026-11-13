"""Frecuencias absolutas, relativas, intervalos de confianza y contraste frente al azar."""
from __future__ import annotations

import numpy as np
import pandas as pd
from scipy import stats

from app.engine import MAIN_VARIABLES, VARIABLE_LABELS
from app.engine.context import AnalysisContext, counts_for
from app.engine.rules import pooled_main_probability
from app.engine.stats_utils import adjust_pvalues, chi2_gof, safe_float, wilson_ci


def _per_number_tests(counts: np.ndarray, n: int, probs: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    z = np.zeros_like(counts)
    pvals = np.full(len(counts), np.nan)
    for i, (k, p) in enumerate(zip(counts, probs)):
        if n == 0 or p <= 0 or p >= 1:
            continue
        pvals[i] = stats.binomtest(int(k), n, float(p)).pvalue
        z[i] = (k - n * p) / np.sqrt(n * p * (1 - p))
    return z, pvals, adjust_pvalues(pvals, "fdr_bh")


def frequency_table(frame: pd.DataFrame, var: str, ctx: AnalysisContext) -> dict:
    """Frecuencias de una variable (posición 1..5 o Súper Número)."""
    domain, base = ctx.domains[var], ctx.baselines[var]
    n = int(len(frame))
    counts, outside = counts_for(frame[var].to_numpy(), domain)
    lo, hi = wilson_ci(counts, n)
    z, p, p_adj = _per_number_tests(counts, n, base.probs)
    rows = []
    for i, num in enumerate(domain.values):
        rows.append({
            "number": int(num),
            "count": int(counts[i]),
            "relative": safe_float(counts[i] / n) if n else None,
            "percent": safe_float(100 * counts[i] / n) if n else None,
            "ci95_low": safe_float(lo[i]),
            "ci95_high": safe_float(hi[i]),
            "reference_prob": safe_float(base.probs[i]),
            "expected_count": safe_float(base.probs[i] * n),
            "z_score": safe_float(z[i]),
            "p_value": safe_float(p[i]),
            "p_value_bh": safe_float(p_adj[i]),
            "significant_bh_05": bool(p_adj[i] < 0.05) if not np.isnan(p_adj[i]) else False,
        })
    warnings = ctx.warnings(var)
    if outside:
        warnings.append(f"{outside} valores fuera del rango de las reglas fueron excluidos.")
    return {
        "variable": var,
        "label": VARIABLE_LABELS[var],
        "n_draws": n,
        "reference": {"theoretical": base.theoretical, "description": base.description},
        "gof_test": chi2_gof(counts, base.probs),
        "n_significant_bh": int(sum(r["significant_bh_05"] for r in rows)),
        "rows": rows,
        "warnings": warnings,
        "interpretation": (
            "Las frecuencias describen el pasado. Un número con frecuencia alta no tiene por ello mayor "
            "probabilidad futura salvo que se demuestre fuera de muestra (ver backtesting)."
        ),
    }


def pooled_main_frequency(frame: pd.DataFrame, ctx: AnalysisContext) -> dict:
    """Frecuencia de cada número en cualquiera de las 5 posiciones (proporción de sorteos que lo contienen)."""
    domain = ctx.main_domain
    n = int(len(frame))
    main = frame[list(MAIN_VARIABLES)].to_numpy()
    contains = np.zeros(domain.size)
    appearances = np.zeros(domain.size)
    for row in main:
        idx = domain.index_of(row)
        idx = idx[idx >= 0]
        np.add.at(appearances, idx, 1)
        contains[np.unique(idx)] += 1
    p0, theoretical = pooled_main_probability(ctx.rules, domain)
    z, p, p_adj = _per_number_tests(contains, n, np.full(domain.size, p0))
    lo, hi = wilson_ci(contains, n)
    rows = [{
        "number": int(num),
        "appearances": int(appearances[i]),
        "draws_containing": int(contains[i]),
        "relative": safe_float(contains[i] / n) if n else None,
        "ci95_low": safe_float(lo[i]),
        "ci95_high": safe_float(hi[i]),
        "reference_prob": safe_float(p0),
        "expected_count": safe_float(p0 * n),
        "p_value_bh": safe_float(p_adj[i]),
        "significant_bh_05": bool(p_adj[i] < 0.05) if not np.isnan(p_adj[i]) else False,
    } for i, num in enumerate(domain.values)]
    by_position = {v: counts_for(frame[v].to_numpy(), domain)[0].astype(int).tolist() for v in MAIN_VARIABLES}
    warnings = list(domain.warnings)
    if not theoretical:
        warnings.append("Probabilidad de referencia no confirmada por reglas (repetición u orden desconocidos).")
    return {
        "variable": "main_any",
        "label": "Cualquier posición principal",
        "n_draws": n,
        "numbers": domain.values.astype(int).tolist(),
        "reference": {"theoretical": theoretical, "prob": p0},
        "rows": rows,
        "by_position": by_position,
        "warnings": warnings,
    }
