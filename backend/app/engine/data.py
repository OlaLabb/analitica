"""Representación de sorteos para el motor y selección de ventanas temporales.

Las ventanas relativas ("últimos N meses/años") se anclan por defecto en la fecha del último
sorteo del histórico (no en la fecha actual), para que el análisis sea reproducible.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Literal

import numpy as np
import pandas as pd
from pydantic import BaseModel, Field, model_validator

from app.engine import VARIABLES

COLUMNS = ["draw_id", "draw_date", "weekday", *VARIABLES]


def make_frame(rows: list[dict] | pd.DataFrame) -> pd.DataFrame:
    """Normaliza a un DataFrame ordenado cronológicamente con columnas COLUMNS."""
    df = pd.DataFrame(rows).copy() if not isinstance(rows, pd.DataFrame) else rows.copy()
    if df.empty:
        return pd.DataFrame({c: pd.Series(dtype="int64") for c in COLUMNS}).assign(
            draw_date=pd.Series(dtype="datetime64[ns]")
        )
    if "draw_id" not in df:
        df["draw_id"] = np.arange(1, len(df) + 1)
    df["draw_date"] = pd.to_datetime(df["draw_date"])
    if "weekday" not in df:
        df["weekday"] = df["draw_date"].dt.weekday
    for c in VARIABLES:
        df[c] = df[c].astype("int64")
    df = df[COLUMNS].sort_values(["draw_date", "draw_id"], kind="mergesort").reset_index(drop=True)
    return df


class WindowSpec(BaseModel):
    """Ventana de análisis. Todos los filtros son combinables."""

    mode: Literal["all", "date_range", "last_n_draws", "last_n_months", "last_n_years", "years"] = "all"
    start: date | None = None
    end: date | None = None
    n: int | None = Field(default=None, ge=1)
    years: list[int] | None = None
    months: list[int] | None = None  # 1..12, p. ej. "enero de todos los años"
    weekdays: list[int] | None = None  # 0..6
    anchor: Literal["last_draw", "today"] = "last_draw"

    @model_validator(mode="after")
    def _check(self):
        if self.mode in ("last_n_draws", "last_n_months", "last_n_years") and not self.n:
            raise ValueError(f"El modo {self.mode} requiere 'n'")
        if self.mode == "years" and not self.years:
            raise ValueError("El modo 'years' requiere 'years'")
        if self.months and any(m < 1 or m > 12 for m in self.months):
            raise ValueError("Meses deben estar entre 1 y 12")
        if self.weekdays and any(w < 0 or w > 6 for w in self.weekdays):
            raise ValueError("Días de la semana deben estar entre 0 y 6")
        return self


@dataclass
class WindowResult:
    frame: pd.DataFrame
    spec: dict
    first_date: str | None
    last_date: str | None
    n_draws: int
    warnings: list[str] = field(default_factory=list)

    def describe(self) -> dict:
        return {
            "spec": self.spec,
            "first_date": self.first_date,
            "last_date": self.last_date,
            "n_draws": self.n_draws,
            "draw_ids_hash": draw_ids_hash(self.frame),
            "warnings": self.warnings,
        }


def draw_ids_hash(df: pd.DataFrame) -> str:
    import hashlib

    return hashlib.sha256(",".join(map(str, df["draw_id"].tolist())).encode()).hexdigest()[:16]


def select_window(df: pd.DataFrame, spec: WindowSpec | None, today: date | None = None) -> WindowResult:
    spec = spec or WindowSpec()
    out = df
    warnings: list[str] = []
    if not df.empty:
        anchor = pd.Timestamp(today or date.today()) if spec.anchor == "today" else df["draw_date"].max()
        if spec.mode == "date_range":
            if spec.start:
                out = out[out["draw_date"] >= pd.Timestamp(spec.start)]
            if spec.end:
                out = out[out["draw_date"] <= pd.Timestamp(spec.end)]
        elif spec.mode == "last_n_months":
            out = out[out["draw_date"] > anchor - pd.DateOffset(months=spec.n)]
        elif spec.mode == "last_n_years":
            out = out[out["draw_date"] > anchor - pd.DateOffset(years=spec.n)]
        elif spec.mode == "years":
            out = out[out["draw_date"].dt.year.isin(spec.years)]
        if spec.months:
            out = out[out["draw_date"].dt.month.isin(spec.months)]
        if spec.weekdays is not None:
            out = out[out["weekday"].isin(spec.weekdays)]
        if spec.mode == "last_n_draws":
            if len(out) < spec.n:
                warnings.append(f"Se solicitaron {spec.n} sorteos pero solo hay {len(out)} disponibles.")
            out = out.iloc[-spec.n :]
        if spec.mode in ("last_n_months", "last_n_years"):
            span_start = df["draw_date"].min()
            needed = anchor - (pd.DateOffset(months=spec.n) if spec.mode == "last_n_months" else pd.DateOffset(years=spec.n))
            if span_start > needed:
                warnings.append("El histórico disponible es más corto que la ventana solicitada.")
    out = out.reset_index(drop=True)
    if 0 < len(out) < 30:
        warnings.append(f"Muestra pequeña (n={len(out)}): las estadísticas son muy inestables.")
    if len(out) == 0:
        warnings.append("La ventana seleccionada no contiene sorteos.")
    return WindowResult(
        frame=out,
        spec=spec.model_dump(mode="json"),
        first_date=out["draw_date"].min().date().isoformat() if len(out) else None,
        last_date=out["draw_date"].max().date().isoformat() if len(out) else None,
        n_draws=int(len(out)),
        warnings=warnings,
    )


def season_of(month: int) -> str:
    """Trimestres meteorológicos genéricos (no asume hemisferio ni clima local)."""
    return {12: "dic-feb", 1: "dic-feb", 2: "dic-feb", 3: "mar-may", 4: "mar-may", 5: "mar-may",
            6: "jun-ago", 7: "jun-ago", 8: "jun-ago", 9: "sep-nov", 10: "sep-nov", 11: "sep-nov"}[month]
