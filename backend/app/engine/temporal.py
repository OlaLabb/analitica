"""Inteligencia temporal y de calendario."""
from __future__ import annotations

from datetime import date
from typing import Literal

import numpy as np
import pandas as pd

from app.engine import MAIN_VARIABLES, VARIABLE_LABELS
from app.engine.context import AnalysisContext, counts_for
from app.engine.data import season_of
from app.engine.stats_utils import chi2_homogeneity, safe_float, wilson_ci

Dimension = Literal["weekday", "month", "year", "quarter", "season", "week_of_year", "day_of_month"]
WEEKDAY_NAMES = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]
MONTH_NAMES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre",
               "Octubre", "Noviembre", "Diciembre"]
MIN_GROUP_N = 30


def group_keys(frame: pd.DataFrame, dimension: Dimension) -> pd.Series:
    d = frame["draw_date"]
    if dimension == "weekday":
        return frame["weekday"]
    if dimension == "month":
        return d.dt.month
    if dimension == "year":
        return d.dt.year
    if dimension == "quarter":
        return d.dt.quarter
    if dimension == "season":
        return d.dt.month.map(season_of)
    if dimension == "week_of_year":
        return d.dt.isocalendar().week.astype(int)
    if dimension == "day_of_month":
        return d.dt.day
    raise ValueError(dimension)


def group_label(dimension: str, key) -> str:
    if dimension == "weekday":
        return WEEKDAY_NAMES[int(key)]
    if dimension == "month":
        return MONTH_NAMES[int(key) - 1]
    if dimension == "quarter":
        return f"T{key}"
    return str(key)


def _values(frame: pd.DataFrame, var: str) -> np.ndarray:
    if var == "main_any":
        return frame[list(MAIN_VARIABLES)].to_numpy().ravel()
    return frame[var].to_numpy()


def grouped_frequencies(frame: pd.DataFrame, var: str, dimension: Dimension, ctx: AnalysisContext,
                        top: int = 5) -> dict:
    """Frecuencia de cada número por grupo del calendario + prueba de homogeneidad entre grupos."""
    domain = ctx.main_domain if var == "main_any" else ctx.domains[var]
    keys = group_keys(frame, dimension)
    groups = []
    matrix = []
    for key in sorted(keys.unique().tolist()):
        sub = frame[keys == key]
        c, _ = counts_for(_values(sub, var), domain)
        n = len(sub)
        units = n * (5 if var == "main_any" else 1)
        matrix.append(c)
        order = np.lexsort((domain.values, -c))[:top]
        lo, hi = wilson_ci(c[order], units)
        groups.append({
            "key": key if not isinstance(key, (np.integer,)) else int(key),
            "label": group_label(dimension, key),
            "n_draws": int(n),
            "insufficient_sample": n < MIN_GROUP_N,
            "counts": c.astype(int).tolist(),
            "relative": [safe_float(x / units) if units else None for x in c],
            "top": [{"number": int(domain.values[j]), "count": int(c[j]),
                     "relative": safe_float(c[j] / units) if units else None,
                     "ci95": [safe_float(lo[i]), safe_float(hi[i])]} for i, j in enumerate(order)],
        })
    test = chi2_homogeneity(np.array(matrix)) if len(matrix) >= 2 else None
    warnings = list(domain.warnings)
    small = [g["label"] for g in groups if g["insufficient_sample"]]
    if small:
        warnings.append(f"Grupos con menos de {MIN_GROUP_N} sorteos (resultados inestables): {', '.join(small)}.")
    p = test.get("p_value") if test else None
    verdict = ("No evaluable" if p is None else
               "Las distribuciones difieren entre grupos (α=0.05)" if p < 0.05 else
               "No hay evidencia de que la distribución dependa de esta dimensión (α=0.05)")
    return {"variable": var, "label": VARIABLE_LABELS.get(var, "Cualquier posición principal"),
            "dimension": dimension, "numbers": domain.values.astype(int).tolist(), "groups": groups,
            "homogeneity_test": test, "verdict": verdict, "warnings": warnings}


def calendar_neighbourhood(frame: pd.DataFrame, ctx: AnalysisContext, ref: date, days: int = 0,
                           var: str = "main_any", years: int | None = None) -> dict:
    """Sorteos realizados en el mismo día/mes (``days`` = 0) o a ±``days`` días de esa fecha en cada año."""
    if frame.empty:
        return {"reference_date": ref.isoformat(), "draws": [], "warnings": ["Sin sorteos"]}
    df = frame.copy()
    yrs = df["draw_date"].dt.year
    # distancia en días al mismo día-mes del año del sorteo, del anterior y del siguiente
    # (así ±días funciona también alrededor del cambio de año)
    day = min(ref.day, 28) if ref.month == 2 else ref.day
    dists = []
    for shift in (-1, 0, 1):
        target = pd.to_datetime([f"{y + shift}-{ref.month:02d}-{day:02d}" for y in yrs])
        dists.append(np.abs((df["draw_date"].to_numpy() - target.to_numpy()).astype("timedelta64[D]").astype(int)))
    mask = np.min(np.vstack(dists), axis=0) <= days
    if years:
        mask &= (yrs >= ref.year - years).to_numpy()
    mask &= (df["draw_date"] < pd.Timestamp(ref)).to_numpy() | (df["draw_date"].dt.year < ref.year).to_numpy()
    sub = df[mask]
    domain = ctx.main_domain if var == "main_any" else ctx.domains[var]
    c_sub, _ = counts_for(_values(sub, var), domain)
    c_all, _ = counts_for(_values(frame, var), domain)
    k = 5 if var == "main_any" else 1
    rows = [{"number": int(num), "count_window": int(c_sub[i]),
             "rel_window": safe_float(c_sub[i] / (len(sub) * k)) if len(sub) else None,
             "rel_overall": safe_float(c_all[i] / (len(frame) * k)) if len(frame) else None}
            for i, num in enumerate(domain.values)]
    warnings = []
    if len(sub) < MIN_GROUP_N:
        warnings.append(f"Solo {len(sub)} sorteos cumplen el criterio: cualquier diferencia es muy probablemente ruido.")
    return {
        "reference_date": ref.isoformat(),
        "days": days,
        "variable": var,
        "n_draws": int(len(sub)),
        "draws": [{"draw_date": r.draw_date.date().isoformat(), "weekday": int(r.weekday),
                   "numbers": [int(getattr(r, v)) for v in MAIN_VARIABLES], "sn": int(r.sn)}
                  for r in sub.itertuples()],
        "rows": rows,
        "warnings": warnings,
    }
