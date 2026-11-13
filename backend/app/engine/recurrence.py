"""Recurrencia: intervalos (en sorteos) entre apariciones de cada número.

Bajo sorteos independientes, el intervalo de un número con probabilidad p por sorteo sigue una
distribución geométrica con media 1/p. Una ausencia larga NO aumenta la probabilidad de aparecer
(falacia del jugador). Este módulo compara lo observado con esa expectativa.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from app.engine import MAIN_VARIABLES, VARIABLE_LABELS
from app.engine.context import AnalysisContext
from app.engine.rules import pooled_main_probability
from app.engine.stats_utils import chi2_gof, safe_float

GAP_BINS = [1, 2, 3, 4, 5, 7, 10, 15, 20, 30, 50, 75, 100, 150, 250, 500]


def occurrence_matrix(frame: pd.DataFrame, var: str, ctx: AnalysisContext) -> tuple[np.ndarray, np.ndarray]:
    """Matriz booleana sorteos × dominio: ¿apareció el número en el sorteo t? y probabilidad base."""
    if var == "main_any":
        domain = ctx.main_domain
        occ = np.zeros((len(frame), domain.size), dtype=bool)
        idx = domain.index_of(frame[list(MAIN_VARIABLES)].to_numpy().ravel()).reshape(len(frame), -1)
        for t in range(len(frame)):
            v = idx[t][idx[t] >= 0]
            occ[t, v] = True
        p0, _ = pooled_main_probability(ctx.rules, domain)
        return occ, np.full(domain.size, p0)
    domain = ctx.domains[var]
    idx = domain.index_of(frame[var].to_numpy())
    occ = np.zeros((len(frame), domain.size), dtype=bool)
    valid = idx >= 0
    occ[np.arange(len(frame))[valid], idx[valid]] = True
    return occ, ctx.baselines[var].probs


def recurrence_table(frame: pd.DataFrame, var: str, ctx: AnalysisContext) -> dict:
    domain = ctx.main_domain if var == "main_any" else ctx.domains[var]
    occ, p0 = occurrence_matrix(frame, var, ctx)
    n = len(frame)
    dates = frame["draw_date"].dt.date.astype(str).tolist() if n else []
    rows = []
    all_gaps: list[int] = []
    expected_hist = np.zeros(len(GAP_BINS))
    for j, num in enumerate(domain.values):
        pos = np.flatnonzero(occ[:, j])
        gaps = np.diff(pos)
        all_gaps.extend(gaps.tolist())
        p = float(p0[j]) if len(p0) else 0.0
        if len(gaps) and 0 < p < 1:
            # pmf geométrica agrupada en los mismos intervalos que el histograma observado
            edges = GAP_BINS + [10**9]
            cdf = lambda g: 1 - (1 - p) ** (g - 1)  # noqa: E731  P(G < g)
            expected_hist += len(gaps) * np.array([cdf(edges[i + 1]) - cdf(edges[i]) for i in range(len(GAP_BINS))])
        current = int(n - 1 - pos[-1]) if len(pos) else None
        rows.append({
            "number": int(num),
            "appearances": int(len(pos)),
            "last_seen_date": dates[pos[-1]] if len(pos) else None,
            "draws_since_last": current,
            "never_seen": len(pos) == 0,
            "gap_mean": safe_float(gaps.mean()) if len(gaps) else None,
            "gap_median": safe_float(np.median(gaps)) if len(gaps) else None,
            "gap_min": int(gaps.min()) if len(gaps) else None,
            "gap_max": int(gaps.max()) if len(gaps) else None,
            "gap_std": safe_float(gaps.std(ddof=1)) if len(gaps) > 1 else None,
            "gap_cv": safe_float(gaps.std(ddof=1) / gaps.mean()) if len(gaps) > 1 and gaps.mean() > 0 else None,
            "expected_gap": safe_float(1 / p) if p > 0 else None,
            # P(una ausencia al menos tan larga | azar). Descriptivo: NO es probabilidad de aparecer.
            "absence_tail_prob": safe_float((1 - p) ** current) if current is not None and 0 < p < 1 else None,
        })
    observed_hist = np.zeros(len(GAP_BINS))
    if all_gaps:
        observed_hist = np.histogram(all_gaps, bins=GAP_BINS + [10**9])[0].astype(float)
    test = chi2_gof(observed_hist, expected_hist / expected_hist.sum()) if expected_hist.sum() > 0 else None
    label = "Cualquier posición principal" if var == "main_any" else VARIABLE_LABELS[var]
    return {
        "variable": var,
        "label": label,
        "n_draws": n,
        "rows": rows,
        "gap_histogram": {
            "bins": [f"{GAP_BINS[i]}–{GAP_BINS[i + 1] - 1}" if i + 1 < len(GAP_BINS) else f"≥{GAP_BINS[i]}"
                     for i in range(len(GAP_BINS))],
            "observed": observed_hist.astype(int).tolist(),
            "expected_geometric": [safe_float(x) for x in expected_hist],
        },
        "geometric_fit_test": test,
        "warnings": ([] if var == "main_any" else ctx.warnings(var)),
        "interpretation": (
            "Si los sorteos son independientes, el tiempo sin aparecer no cambia la probabilidad de "
            "aparecer en el próximo sorteo. 'absence_tail_prob' solo describe cuán inusual es la ausencia."
        ),
    }
