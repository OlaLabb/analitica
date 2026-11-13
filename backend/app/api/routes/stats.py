"""Estadísticas exploratorias. Todos los endpoints aceptan la misma ventana temporal:

mode=all|date_range|last_n_draws|last_n_months|last_n_years|years, n, start, end,
years=2023,2024, months=1,12, weekdays=0,2,5

Cambiar la ventana NO modifica el histórico ni ninguna predicción: es solo una vista.
"""
from __future__ import annotations

from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, get_game
from app.db import get_db
from app.engine import cooccurrence as co
from app.engine import distribution as dist
from app.engine import frequencies as freq
from app.engine import recurrence as rec
from app.engine import temporal as tmp
from app.engine import trends
from app.engine.context import build_context
from app.engine.data import WindowSpec, select_window
from app.models import Game, Profile
from app.services import history

router = APIRouter(prefix="/games/{game_code}/stats", tags=["Estadísticas"])
Var = Literal["p1", "p2", "p3", "p4", "p5", "sn"]
VarAny = Literal["p1", "p2", "p3", "p4", "p5", "sn", "main_any"]


def _ints(s: str | None) -> list[int] | None:
    if not s:
        return None
    try:
        return [int(x) for x in s.split(",") if x.strip()]
    except ValueError:
        raise HTTPException(422, f"Lista de enteros inválida: {s}")


def window_params(mode: str = "all", n: int | None = Query(None, ge=1), start: date | None = None,
                  end: date | None = None, years: str | None = None, months: str | None = None,
                  weekdays: str | None = None) -> WindowSpec:
    try:
        return WindowSpec(mode=mode, n=n, start=start, end=end, years=_ints(years), months=_ints(months),
                          weekdays=_ints(weekdays))
    except ValueError as e:
        raise HTTPException(422, str(e))


class Ctx:
    def __init__(self, game: Game = Depends(get_game), db: Session = Depends(get_db),
                 spec: WindowSpec = Depends(window_params), _: Profile = Depends(get_current_user)):
        self.game = game
        self.full = history.load_frame(db, game)
        self.rules = history.to_engine_rules(history.active_rules_row(db, game))
        self.ctx = build_context(self.full, self.rules)
        self.win = select_window(self.full, spec)
        self.hv = history.current_version(db, game)

    def wrap(self, payload: dict) -> dict:
        return {"window": self.win.describe(), "historical_version": self.hv.version_number if self.hv else None,
                "rules_confirmed": self.rules.fully_confirmed, "result": payload}


@router.get("/frequencies")
def frequencies(var: VarAny = "p1", c: Ctx = Depends()):
    if var == "main_any":
        return c.wrap(freq.pooled_main_frequency(c.win.frame, c.ctx))
    return c.wrap(freq.frequency_table(c.win.frame, var, c.ctx))


@router.get("/frequencies/positions")
def frequencies_all_positions(c: Ctx = Depends()):
    return c.wrap({v: freq.frequency_table(c.win.frame, v, c.ctx) for v in ["p1", "p2", "p3", "p4", "p5", "sn"]})


@router.get("/recurrence")
def recurrence(var: VarAny = "main_any", c: Ctx = Depends()):
    return c.wrap(rec.recurrence_table(c.win.frame, var, c.ctx))


@router.get("/trends/rolling")
def rolling(var: VarAny = "sn", window: int = Query(50, ge=2, le=5000), numbers: str | None = None, c: Ctx = Depends()):
    return c.wrap(trends.rolling_frequency(c.win.frame, var, c.ctx, window, _ints(numbers)))


@router.get("/trends/recent-vs-previous")
def recent_vs_previous(var: Var = "sn", window: int = Query(100, ge=2), c: Ctx = Depends()):
    return c.wrap(trends.recent_vs_previous(c.win.frame, var, c.ctx, window))


@router.get("/trends/compare")
def compare(var: Var = "sn", b_mode: str = "all", b_n: int | None = None, b_start: date | None = None,
            b_end: date | None = None, b_years: str | None = None, b_months: str | None = None,
            b_weekdays: str | None = None, c: Ctx = Depends()):
    """Compara la ventana principal (A) con una segunda ventana (B, parámetros con prefijo b_)."""
    spec_b = window_params(b_mode, b_n, b_start, b_end, b_years, b_months, b_weekdays)
    wb = select_window(c.full, spec_b)
    out = trends.compare_frames(c.win.frame, wb.frame, var, c.ctx, "A", "B")
    out["window_b"] = wb.describe()
    return c.wrap(out)


@router.get("/trends/yearly")
def yearly(var: Var = "sn", c: Ctx = Depends()):
    return c.wrap(trends.yearly_evolution(c.win.frame, var, c.ctx))


@router.get("/distribution")
def distribution(var: Var = "p1", c: Ctx = Depends()):
    return c.wrap(dist.describe_variable(c.win.frame, var, c.ctx))


@router.get("/distribution/sums")
def sums(c: Ctx = Depends()):
    return c.wrap(dist.sum_distribution(c.win.frame, c.ctx))


@router.get("/cooccurrence/pairs")
def pairs(top: int = Query(25, ge=1, le=200), c: Ctx = Depends()):
    return c.wrap(co.pair_analysis(c.win.frame, c.ctx, top))


@router.get("/cooccurrence/groups")
def groups(size: int = Query(3, ge=2, le=5), top: int = Query(20, ge=1, le=200), c: Ctx = Depends()):
    return c.wrap(co.frequent_groups(c.win.frame, size, top))


@router.get("/cooccurrence/repeats")
def repeats(max_lag: int = Query(10, ge=1, le=100), c: Ctx = Depends()):
    return c.wrap(co.consecutive_repeats(c.win.frame, c.ctx, max_lag))


@router.get("/cooccurrence/transitions")
def transitions(var: Var = "sn", c: Ctx = Depends()):
    return c.wrap(co.transition_analysis(c.win.frame, var, c.ctx))


@router.get("/cooccurrence/positions")
def positions(c: Ctx = Depends()):
    return c.wrap(co.position_relations(c.win.frame, c.ctx))


@router.get("/temporal/grouped")
def grouped(var: VarAny = "main_any",
            dimension: Literal["weekday", "month", "year", "quarter", "season", "week_of_year", "day_of_month"] = "weekday",
            top: int = Query(5, ge=1, le=50), c: Ctx = Depends()):
    return c.wrap(tmp.grouped_frequencies(c.win.frame, var, dimension, c.ctx, top))


@router.get("/temporal/calendar")
def calendar(ref: date, days: int = Query(0, ge=0, le=60), var: VarAny = "main_any",
             last_years: int | None = Query(None, ge=1), c: Ctx = Depends()):
    return c.wrap(tmp.calendar_neighbourhood(c.win.frame, c.ctx, ref, days, var, last_years))
