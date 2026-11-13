"""Configuración de modelos predictivos (versionada en la tabla model_configurations)."""
from __future__ import annotations

import hashlib
import json
from typing import Literal

from pydantic import BaseModel, Field, model_validator

from app.engine.data import WindowSpec

ModelType = Literal[
    "baseline", "frequency_all", "frequency_recent", "ewma", "recurrence", "weekday", "month", "transition"
]

MODEL_DESCRIPTIONS: dict[str, str] = {
    "baseline": "Distribución de referencia bajo azar (teórica si las reglas están confirmadas).",
    "frequency_all": "Frecuencia histórica de toda la ventana, suavizada hacia la referencia (Dirichlet).",
    "frequency_recent": "Frecuencia de los últimos N sorteos, suavizada hacia la referencia.",
    "ewma": "Frecuencia con decaimiento exponencial (media móvil exponencial, vida media H sorteos).",
    "recurrence": "Razón de riesgo empírica según los sorteos transcurridos desde la última aparición, "
    "estimada con el histórico y contraída hacia 1 (sin efecto).",
    "weekday": "Frecuencia condicionada al día de la semana del sorteo objetivo, contraída hacia la frecuencia global.",
    "month": "Frecuencia condicionada al mes del sorteo objetivo, contraída hacia la frecuencia global.",
    "transition": "Cadena de Markov de orden 1: frecuencia del valor siguiente dado el último valor observado, "
    "contraída hacia la frecuencia global.",
}


class ModelSpec(BaseModel):
    id: str = Field(pattern=r"^[a-z0-9_]{2,40}$")
    type: ModelType
    window: int | None = Field(default=None, ge=1)  # frequency_recent
    half_life: float | None = Field(default=None, gt=0)  # ewma
    shrinkage: float | None = Field(default=None, ge=0)  # weekday/month/transition/recurrence
    bin_edges: list[int] | None = None  # recurrence

    @model_validator(mode="after")
    def _check(self):
        if self.type == "frequency_recent" and not self.window:
            raise ValueError("frequency_recent requiere 'window'")
        if self.type == "ewma" and not self.half_life:
            raise ValueError("ewma requiere 'half_life'")
        if self.bin_edges is not None and (self.bin_edges != sorted(set(self.bin_edges)) or self.bin_edges[0] != 1):
            raise ValueError("bin_edges debe ser creciente y empezar en 1")
        return self


class BacktestDefaults(BaseModel):
    min_train: int = Field(default=100, ge=10)
    top_ks: list[int] = Field(default_factory=lambda: [1, 3, 5])


class EngineConfig(BaseModel):
    prior_strength: float | None = Field(
        default=None, ge=0, description="Pseudo-conteos del prior Dirichlet; None = tamaño del dominio"
    )
    models: list[ModelSpec]
    ensemble_weights: dict[str, float] = Field(default_factory=dict)
    official_model: str = "ensemble"
    top_k: int = Field(default=5, ge=1, le=50)
    combinations_count: int = Field(default=5, ge=0, le=50)
    data_scope: WindowSpec = Field(default_factory=WindowSpec)
    backtest: BacktestDefaults = Field(default_factory=BacktestDefaults)

    @model_validator(mode="after")
    def _check(self):
        ids = [m.id for m in self.models]
        if len(ids) != len(set(ids)):
            raise ValueError("Los id de modelos deben ser únicos")
        if "baseline" not in [m.type for m in self.models]:
            raise ValueError("Debe incluirse un modelo 'baseline' (referencia de azar)")
        if "ensemble" in ids:
            raise ValueError("'ensemble' es un nombre reservado")
        for k, w in self.ensemble_weights.items():
            if k not in ids:
                raise ValueError(f"Peso para modelo inexistente: {k}")
            if w < 0:
                raise ValueError("Los pesos deben ser >= 0")
        if self.ensemble_weights and sum(self.ensemble_weights.values()) <= 0:
            raise ValueError("La suma de pesos del ensamble debe ser > 0")
        if self.official_model != "ensemble" and self.official_model not in ids:
            raise ValueError("official_model debe ser 'ensemble' o un id de modelo")
        if self.official_model == "ensemble" and not self.ensemble_weights:
            raise ValueError("El ensamble requiere pesos")
        return self

    def model_ids(self) -> list[str]:
        ids = [m.id for m in self.models]
        return ids + (["ensemble"] if self.ensemble_weights else [])

    def baseline_id(self) -> str:
        return next(m.id for m in self.models if m.type == "baseline")


def default_config() -> EngineConfig:
    return EngineConfig(
        models=[
            ModelSpec(id="baseline", type="baseline"),
            ModelSpec(id="frequency_all", type="frequency_all"),
            ModelSpec(id="recent_50", type="frequency_recent", window=50),
            ModelSpec(id="recent_100", type="frequency_recent", window=100),
            ModelSpec(id="ewma_30", type="ewma", half_life=30),
            ModelSpec(id="recurrence", type="recurrence", shrinkage=20,
                      bin_edges=[1, 2, 3, 4, 6, 9, 14, 21, 32, 48, 72, 108, 162]),
            ModelSpec(id="weekday", type="weekday", shrinkage=100),
            ModelSpec(id="month", type="month", shrinkage=100),
            ModelSpec(id="transition", type="transition", shrinkage=100),
        ],
        ensemble_weights={"frequency_all": 1, "recent_50": 1, "ewma_30": 1, "recurrence": 1,
                          "weekday": 1, "month": 1, "transition": 1},
        official_model="ensemble",
    )


def canonical_json(obj) -> str:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False, default=str)


def sha256_json(obj) -> str:
    return hashlib.sha256(canonical_json(obj).encode()).hexdigest()


def config_hash(cfg: EngineConfig) -> str:
    return sha256_json(cfg.model_dump(mode="json"))
