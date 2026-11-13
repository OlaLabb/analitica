"""Estadísticos suficientes del histórico completo, actualizables de forma incremental.

``build_full`` recorre todo el histórico; ``apply_incremental`` parte de un snapshot anterior y
agrega solo los sorteos nuevos (permitido únicamente si son POSTERIORES al último sorteo del
snapshot). La prueba de consistencia verifica que ambos caminos producen exactamente lo mismo.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from app.engine import VARIABLES
from app.engine.config import sha256_json

SNAPSHOT_KIND = "sufficient_stats_v1"


def _empty(domains: dict[str, tuple[int, int]]) -> dict:
    out = {"n_draws": 0, "last_draw_date": None, "last_draw_id": None, "domains": domains, "variables": {}}
    for v, (lo, hi) in domains.items():
        D = hi - lo + 1
        out["variables"][v] = {
            "counts": [0] * D,
            "weekday_counts": [[0] * D for _ in range(7)],
            "month_counts": [[0] * D for _ in range(12)],
            "last_seen": [None] * D,  # índice de sorteo (0-based) de la última aparición
            "gap_sum": [0] * D,
            "gap_sumsq": [0] * D,
            "gap_n": [0] * D,
            "gap_max": [0] * D,
            "out_of_domain": 0,
        }
    return out


def apply_draws(snap: dict, frame: pd.DataFrame) -> dict:
    """Agrega los sorteos de ``frame`` (orden cronológico) a una copia del snapshot."""
    import copy

    s = copy.deepcopy(snap)
    if len(frame) and s["last_draw_date"] is not None and \
            frame["draw_date"].min().date().isoformat() <= s["last_draw_date"]:
        raise ValueError("Actualización incremental no segura: hay sorteos anteriores o iguales al último procesado")
    for row in frame.itertuples(index=False):
        t = s["n_draws"]
        month = row.draw_date.month
        for v in VARIABLES:
            lo, hi = s["domains"][v]
            val = int(getattr(row, v))
            st = s["variables"][v]
            if not lo <= val <= hi:
                st["out_of_domain"] += 1
                continue
            j = val - lo
            st["counts"][j] += 1
            st["weekday_counts"][int(row.weekday)][j] += 1
            st["month_counts"][month - 1][j] += 1
            if st["last_seen"][j] is not None:
                g = t - st["last_seen"][j]
                st["gap_sum"][j] += g
                st["gap_sumsq"][j] += g * g
                st["gap_n"][j] += 1
                st["gap_max"][j] = max(st["gap_max"][j], g)
            st["last_seen"][j] = t
        s["n_draws"] = t + 1
        s["last_draw_date"] = row.draw_date.date().isoformat()
        s["last_draw_id"] = int(row.draw_id)
    return s


def build_full(frame: pd.DataFrame, domains: dict[str, tuple[int, int]]) -> dict:
    return apply_draws(_empty(domains), frame)


def snapshot_hash(snap: dict) -> str:
    return sha256_json({k: v for k, v in snap.items() if k != "last_draw_id"})


def summary_from_snapshot(snap: dict) -> dict:
    out = {}
    n = snap["n_draws"]
    for v, st in snap["variables"].items():
        lo, _ = snap["domains"][v]
        counts = np.array(st["counts"])
        gap_n = np.array(st["gap_n"])
        mean_gap = np.where(gap_n > 0, np.array(st["gap_sum"]) / np.maximum(gap_n, 1), np.nan)
        out[v] = {
            "numbers": list(range(lo, lo + len(counts))),
            "counts": counts.tolist(),
            "draws_since_last": [None if ls is None else n - 1 - ls for ls in st["last_seen"]],
            "mean_gap": [None if np.isnan(x) else round(float(x), 4) for x in mean_gap],
        }
    return out
