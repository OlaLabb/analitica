"""DATOS SINTÉTICOS EXCLUSIVOS PARA PRUEBAS. No representan sorteos reales."""
from __future__ import annotations

from datetime import date, timedelta

import numpy as np

from app.engine.data import make_frame

SYNTHETIC_RULES = dict(main_min=1, main_max=43, super_min=1, super_max=16, main_unique=True,
                       main_order="sorted_asc", draw_weekdays=[0, 2, 5])


# Categorías de premio SINTÉTICAS para pruebas (mismo esquema que la tabla oficial).
SYNTHETIC_PRIZES = [{"matches": 5, "super": True, "label": "5 + SB"}, {"matches": 5, "super": False, "label": "5"},
                    {"matches": 4, "super": True, "label": "4 + SB"}, {"matches": 4, "super": False, "label": "4"},
                    {"matches": 3, "super": True, "label": "3 + SB"}, {"matches": 3, "super": False, "label": "3"},
                    {"matches": 2, "super": True, "label": "2 + SB"}, {"matches": 0, "super": True, "label": "0 + SB"}]


def synthetic_dates(n: int, start: date = date(2020, 1, 1)) -> list[date]:
    out, d = [], start
    while len(out) < n:
        if d.weekday() in (0, 2, 5):
            out.append(d)
        d += timedelta(days=1)
    return out


def make_synthetic_rows(n: int, seed: int = 7, sn_bias: dict[int, float] | None = None) -> list[dict]:
    """Sorteos uniformes (5 de 43 sin reposición, ordenados; SN 1–16). ``sn_bias`` permite sesgar
    el SN para comprobar que el backtesting tiene potencia para detectar un patrón real."""
    rng = np.random.default_rng(seed)
    p_sn = np.full(16, 1 / 16)
    if sn_bias:
        for k, w in sn_bias.items():
            p_sn[k - 1] = w
        p_sn = p_sn / p_sn.sum()
    rows = []
    for i, d in enumerate(synthetic_dates(n)):
        main = sorted(int(x) for x in rng.choice(np.arange(1, 44), 5, replace=False))
        rows.append({"draw_id": i + 1, "draw_date": d, "p1": main[0], "p2": main[1], "p3": main[2], "p4": main[3],
                     "p5": main[4], "sn": int(rng.choice(np.arange(1, 17), p=p_sn))})
    return rows


def synthetic_frame(n: int, seed: int = 7, **kw):
    return make_frame(make_synthetic_rows(n, seed, **kw))
