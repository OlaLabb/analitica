"""Tendencias: medias móviles de frecuencia, comparación de ventanas y periodos, estabilidad."""
from __future__ import annotations

import numpy as np
import pandas as pd
from scipy import stats

from app.engine import VARIABLE_LABELS
from app.engine.context import AnalysisContext, counts_for
from app.engine.recurrence import occurrence_matrix
from app.engine.stats_utils import adjust_pvalues, chi2_homogeneity, safe_float


def rolling_frequency(frame: pd.DataFrame, var: str, ctx: AnalysisContext, window: int,
                      numbers: list[int] | None = None, max_points: int = 400) -> dict:
    """Frecuencia relativa móvil (últimos ``window`` sorteos) para cada número."""
    domain = ctx.main_domain if var == "main_any" else ctx.domains[var]
    occ, p0 = occurrence_matrix(frame, var, ctx)
    n = len(frame)
    if n < window:
        return {"variable": var, "window": window, "dates": [], "series": [],
                "warnings": [f"Se necesitan al menos {window} sorteos (hay {n})."]}
    csum = np.vstack([np.zeros((1, domain.size)), np.cumsum(occ, axis=0)])
    roll = (csum[window:] - csum[:-window]) / window  # fila i = ventana que termina en el sorteo i+window-1
    end_idx = np.arange(window - 1, n)
    step = max(1, len(end_idx) // max_points)
    sel = np.arange(len(end_idx) - 1, -1, -step)[::-1]
    dates = frame["draw_date"].iloc[end_idx[sel]].dt.date.astype(str).tolist()
    stability = roll.std(axis=0)
    if numbers:
        cols = [int(np.flatnonzero(domain.values == x)[0]) for x in numbers if x in domain.values]
    else:  # por defecto: 8 números con mayor frecuencia en la última ventana
        cols = list(np.argsort(-roll[-1], kind="stable")[:8])
    series = [{
        "number": int(domain.values[j]),
        "values": [safe_float(v) for v in roll[sel, j]],
        "reference_prob": safe_float(p0[j]),
    } for j in cols]
    return {
        "variable": var,
        "label": VARIABLE_LABELS.get(var, "Cualquier posición principal"),
        "window": window,
        "dates": dates,
        "series": series,
        "stability": [{"number": int(domain.values[j]), "rolling_std": safe_float(stability[j]),
                       "latest": safe_float(roll[-1, j])} for j in range(domain.size)],
        "warnings": [],
    }


def compare_frames(a: pd.DataFrame, b: pd.DataFrame, var: str, ctx: AnalysisContext,
                   label_a: str = "A", label_b: str = "B") -> dict:
    """¿Cambió la distribución de la variable entre dos conjuntos de sorteos?"""
    domain = ctx.domains[var]
    ca, _ = counts_for(a[var].to_numpy(), domain)
    cb, _ = counts_for(b[var].to_numpy(), domain)
    na, nb = len(a), len(b)
    test = chi2_homogeneity(np.vstack([ca, cb]))
    pvals = np.full(domain.size, np.nan)
    rows = []
    for i, num in enumerate(domain.values):
        if na and nb and (ca[i] + cb[i]) > 0:
            pa, pb = ca[i] / na, cb[i] / nb
            pp = (ca[i] + cb[i]) / (na + nb)
            se = np.sqrt(pp * (1 - pp) * (1 / na + 1 / nb))
            if se > 0:
                pvals[i] = 2 * stats.norm.sf(abs(pa - pb) / se)
        rows.append({"number": int(num), "count_a": int(ca[i]), "count_b": int(cb[i]),
                     "rel_a": safe_float(ca[i] / na) if na else None,
                     "rel_b": safe_float(cb[i] / nb) if nb else None})
    adj = adjust_pvalues(pvals, "fdr_bh")
    for r, p, q in zip(rows, pvals, adj):
        r["diff"] = safe_float((r["rel_a"] or 0) - (r["rel_b"] or 0)) if na and nb else None
        r["p_value"] = safe_float(p)
        r["p_value_bh"] = safe_float(q)
        r["significant_bh_05"] = bool(q < 0.05) if not np.isnan(q) else False
    warnings = list(ctx.warnings(var))
    if min(na, nb) < 30:
        warnings.append("Al menos uno de los periodos tiene menos de 30 sorteos: comparación poco fiable.")
    p = test.get("p_value")
    verdict = ("Sin datos suficientes" if p is None else
               "Diferencia estadísticamente significativa entre periodos (α=0.05)" if p < 0.05 else
               "No hay evidencia de diferencia entre periodos (α=0.05)")
    return {"variable": var, "label": VARIABLE_LABELS[var], "label_a": label_a, "label_b": label_b,
            "n_a": na, "n_b": nb, "homogeneity_test": test, "verdict": verdict, "rows": rows,
            "warnings": warnings}


def recent_vs_previous(frame: pd.DataFrame, var: str, ctx: AnalysisContext, window: int) -> dict:
    if len(frame) <= window:
        return {"variable": var, "warnings": [f"Se necesitan más de {window} sorteos."], "rows": []}
    return compare_frames(frame.iloc[-window:], frame.iloc[:-window], var, ctx,
                          f"Últimos {window}", "Anteriores")


def yearly_evolution(frame: pd.DataFrame, var: str, ctx: AnalysisContext) -> dict:
    domain = ctx.domains[var]
    years = sorted(frame["draw_date"].dt.year.unique().tolist())
    matrix = []
    ns = []
    for y in years:
        sub = frame[frame["draw_date"].dt.year == y]
        c, _ = counts_for(sub[var].to_numpy(), domain)
        matrix.append(c)
        ns.append(len(sub))
    test = chi2_homogeneity(np.array(matrix)) if len(years) >= 2 else None
    return {
        "variable": var,
        "label": VARIABLE_LABELS[var],
        "years": years,
        "n_per_year": ns,
        "numbers": domain.values.astype(int).tolist(),
        "relative": [[safe_float(x / n) if n else None for x in row] for row, n in zip(matrix, ns)],
        "counts": [[int(x) for x in row] for row in matrix],
        "homogeneity_test": test,
        "warnings": ctx.warnings(var),
    }
