"""Herramientas estadísticas comunes."""
from __future__ import annotations

import numpy as np
from scipy import stats
from statsmodels.stats.multitest import multipletests

Z90 = 1.6448536269514722
Z95 = 1.959963984540054


def wilson_ci(k: np.ndarray | int, n: int, z: float = Z95) -> tuple[np.ndarray, np.ndarray]:
    k = np.asarray(k, dtype=float)
    if n == 0:
        return np.zeros_like(k), np.ones_like(k)
    p = k / n
    den = 1 + z**2 / n
    center = (p + z**2 / (2 * n)) / den
    half = z * np.sqrt(p * (1 - p) / n + z**2 / (4 * n**2)) / den
    return np.clip(center - half, 0, 1), np.clip(center + half, 0, 1)


def adjust_pvalues(p: np.ndarray, method: str = "fdr_bh") -> np.ndarray:
    p = np.asarray(p, dtype=float)
    out = np.full_like(p, np.nan)
    mask = ~np.isnan(p)
    if mask.sum() == 0:
        return out
    out[mask] = multipletests(p[mask], method=method)[1]
    return out


def chi2_gof(observed: np.ndarray, expected_probs: np.ndarray) -> dict:
    """Bondad de ajuste chi² con advertencia de frecuencias esperadas bajas."""
    observed = np.asarray(observed, dtype=float)
    n = observed.sum()
    mask = expected_probs > 0
    expected = expected_probs[mask] * n
    obs = observed[mask]
    if n == 0 or mask.sum() < 2:
        return {"statistic": None, "df": None, "p_value": None, "n": int(n), "low_expected_share": None,
                "warning": "Datos insuficientes para la prueba"}
    stat, p = stats.chisquare(obs, expected * obs.sum() / expected.sum())
    low = float(np.mean(expected < 5))
    warning = None
    if low > 0.2:
        warning = (
            f"{low:.0%} de las categorías tienen frecuencia esperada < 5; la aproximación chi² no es fiable."
        )
    return {"statistic": float(stat), "df": int(mask.sum() - 1), "p_value": float(p), "n": int(n),
            "low_expected_share": low, "warning": warning}


def chi2_homogeneity(table: np.ndarray) -> dict:
    """Prueba de homogeneidad (¿las distribuciones de las filas son iguales?)."""
    table = np.asarray(table, dtype=float)
    table = table[:, table.sum(axis=0) > 0]
    table = table[table.sum(axis=1) > 0]
    if table.shape[0] < 2 or table.shape[1] < 2:
        return {"statistic": None, "df": None, "p_value": None, "cramers_v": None,
                "warning": "Se necesitan al menos dos grupos con datos"}
    stat, p, dof, expected = stats.chi2_contingency(table, correction=False)
    n = table.sum()
    v = float(np.sqrt(stat / (n * (min(table.shape) - 1))))
    low = float(np.mean(expected < 5))
    warning = None
    if low > 0.2:
        warning = f"{low:.0%} de las celdas tienen frecuencia esperada < 5; resultado orientativo."
    return {"statistic": float(stat), "df": int(dof), "p_value": float(p), "cramers_v": v,
            "low_expected_share": low, "warning": warning}


def poisson_binomial_sf(k: int, probs: np.ndarray) -> float:
    """P(S >= k) donde S = suma de Bernoulli independientes con probabilidades ``probs`` (exacto)."""
    probs = np.asarray(probs, dtype=float)
    n = len(probs)
    if k <= 0:
        return 1.0
    if k > n:
        return 0.0
    if n > 6000:  # aproximación normal con corrección de continuidad
        mu, var = probs.sum(), (probs * (1 - probs)).sum()
        return float(stats.norm.sf((k - 0.5 - mu) / np.sqrt(max(var, 1e-12))))
    dist = np.zeros(n + 1)
    dist[0] = 1.0
    for i, p in enumerate(probs):
        dist[1 : i + 2] = dist[1 : i + 2] * (1 - p) + dist[0 : i + 1] * p
        dist[0] *= 1 - p
    return float(np.clip(dist[k:].sum(), 0.0, 1.0))


def evidence_label(p_adjusted: float | None, alpha: float = 0.05) -> str:
    if p_adjusted is None or np.isnan(p_adjusted):
        return "no_evaluable"
    return "significativa" if p_adjusted < alpha else "no_significativa"


def safe_float(x) -> float | None:
    if x is None:
        return None
    try:
        f = float(x)
    except (TypeError, ValueError):
        return None
    return None if np.isnan(f) or np.isinf(f) else f
