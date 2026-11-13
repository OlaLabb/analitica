"""Distribución: estadística descriptiva, concentración, suma y paridad de los números principales."""
from __future__ import annotations

import numpy as np
import pandas as pd
from scipy import stats

from app.engine import MAIN_VARIABLES, VARIABLE_LABELS
from app.engine.context import AnalysisContext, counts_for
from app.engine.rules import N_MAIN
from app.engine.stats_utils import chi2_gof, safe_float


def _concentration(counts: np.ndarray) -> dict:
    total = counts.sum()
    if total == 0:
        return {"entropy_normalized": None, "gini": None, "top10pct_share": None}
    p = counts / total
    nz = p[p > 0]
    entropy = float(-(nz * np.log(nz)).sum() / np.log(len(p))) if len(p) > 1 else None
    s = np.sort(counts)
    n = len(s)
    gini = float((2 * np.arange(1, n + 1) - n - 1).dot(s) / (n * s.sum()))
    k = max(1, int(round(0.1 * n)))
    return {"entropy_normalized": entropy, "gini": gini, "top10pct_share": float(np.sort(p)[::-1][:k].sum())}


def describe_variable(frame: pd.DataFrame, var: str, ctx: AnalysisContext) -> dict:
    domain, base = ctx.domains[var], ctx.baselines[var]
    x = frame[var].to_numpy().astype(float)
    counts, _ = counts_for(frame[var].to_numpy(), domain)
    theo_mean = float((domain.values * base.probs).sum()) if domain.size else None
    theo_var = float(((domain.values - theo_mean) ** 2 * base.probs).sum()) if domain.size else None
    out = {
        "variable": var,
        "label": VARIABLE_LABELS[var],
        "n": int(len(x)),
        "mean": safe_float(x.mean()) if len(x) else None,
        "variance": safe_float(x.var(ddof=1)) if len(x) > 1 else None,
        "std": safe_float(x.std(ddof=1)) if len(x) > 1 else None,
        "min": int(x.min()) if len(x) else None,
        "max": int(x.max()) if len(x) else None,
        "quartiles": [safe_float(q) for q in np.quantile(x, [0.25, 0.5, 0.75])] if len(x) else None,
        "skewness": safe_float(stats.skew(x)) if len(x) > 2 else None,
        "kurtosis": safe_float(stats.kurtosis(x)) if len(x) > 3 else None,
        "reference_mean": safe_float(theo_mean),
        "reference_std": safe_float(np.sqrt(theo_var)) if theo_var is not None else None,
        "reference_theoretical": base.theoretical,
        "concentration": _concentration(counts),
        "histogram": {"numbers": domain.values.astype(int).tolist(), "counts": counts.astype(int).tolist(),
                      "expected": [safe_float(p * len(x)) for p in base.probs]},
        "gof_test": chi2_gof(counts, base.probs),
        "warnings": ctx.warnings(var),
    }
    return out


def sum_distribution(frame: pd.DataFrame, ctx: AnalysisContext) -> dict:
    main = frame[list(MAIN_VARIABLES)].to_numpy()
    sums = main.sum(axis=1) if len(main) else np.array([])
    d = ctx.main_domain
    theo = None
    if d.source == "rules" and ctx.rules.main_unique is not None:
        N = d.size
        mu1 = float(d.values.mean())
        s2 = (N**2 - 1) / 12
        var = N_MAIN * s2 * ((N - N_MAIN) / (N - 1) if ctx.rules.main_unique else 1.0)
        theo = {"mean": N_MAIN * mu1, "std": float(np.sqrt(var))}
    hist_bins = np.histogram_bin_edges(sums, bins=20) if len(sums) else np.array([])
    hist = np.histogram(sums, bins=hist_bins)[0].tolist() if len(sums) else []
    # paridad: cantidad de números pares por sorteo
    even = (main % 2 == 0).sum(axis=1) if len(main) else np.array([])
    parity_counts = np.bincount(even.astype(int), minlength=N_MAIN + 1).tolist() if len(even) else [0] * 6
    parity_expected = None
    if d.source == "rules" and ctx.rules.main_unique is True:
        n_even = int((d.values % 2 == 0).sum())
        parity_expected = [safe_float(p * len(main)) for p in stats.hypergeom.pmf(np.arange(6), d.size, n_even, N_MAIN)]
    elif d.source == "rules" and ctx.rules.main_unique is False:
        pe = float((d.values % 2 == 0).mean())
        parity_expected = [safe_float(p * len(main)) for p in stats.binom.pmf(np.arange(6), N_MAIN, pe)]
    return {
        "n": int(len(sums)),
        "mean": safe_float(sums.mean()) if len(sums) else None,
        "std": safe_float(sums.std(ddof=1)) if len(sums) > 1 else None,
        "reference": theo,
        "histogram": {"edges": [safe_float(e) for e in hist_bins], "counts": hist},
        "parity": {"even_count": list(range(6)), "observed": parity_counts, "expected": parity_expected},
        "warnings": [] if theo else ["Referencia teórica no disponible: reglas no confirmadas."],
    }
