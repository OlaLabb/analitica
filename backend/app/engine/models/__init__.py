"""Modelos predictivos por variable (posición 1..5 y Súper Número).

Diseño: un ``VariableState`` acumula, sorteo a sorteo, los estadísticos suficientes de una
variable (conteos, conteos por día/mes, transiciones, decaimientos exponenciales, exposición por
intervalo de recurrencia). Cada modelo convierte ese estado en una distribución de probabilidad
sobre el dominio para el sorteo objetivo.

- La predicción oficial alimenta el estado con TODO el histórico de la ventana y predice.
- El backtesting alimenta el estado cronológicamente y predice ANTES de incorporar cada sorteo,
  por lo que es imposible usar información futura (no hay data leakage por construcción).
Ambos caminos ejecutan exactamente el mismo código.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from app.engine.config import EngineConfig, ModelSpec

DEFAULT_BIN_EDGES = [1, 2, 3, 4, 6, 9, 14, 21, 32, 48, 72, 108, 162]


@dataclass
class Target:
    weekday: int
    month: int


class VariableState:
    def __init__(self, domain_size: int, baseline: np.ndarray, config: EngineConfig):
        D = domain_size
        self.D = D
        self.base = baseline
        self.alpha = float(config.prior_strength) if config.prior_strength is not None else float(D)
        self.specs = config.models
        self.n = 0  # sorteos procesados
        self.n_valid = 0
        self.history: list[int] = []  # índices en el dominio (-1 = fuera)
        self.counts = np.zeros(D)
        self.wd_counts = np.zeros((7, D))
        self.month_counts = np.zeros((13, D))
        self.trans = np.zeros((D, D))
        self.last_idx = -1
        # EWMA por vida media
        self.ewma: dict[float, np.ndarray] = {}
        self.ewma_w: dict[float, float] = {}
        for s in self.specs:
            if s.type == "ewma":
                self.ewma[s.half_life] = np.zeros(D)
                self.ewma_w[s.half_life] = 0.0
        # recurrencia: un acumulador por conjunto de intervalos
        self.gap = np.zeros(D, dtype=np.int64)  # sorteos desde la última aparición (si seen)
        self.seen = np.zeros(D, dtype=bool)
        self.rec: dict[tuple, dict] = {}
        for s in self.specs:
            if s.type == "recurrence":
                edges = tuple(s.bin_edges or DEFAULT_BIN_EDGES)
                nb = len(edges) + 1  # último bin = nunca visto
                self.rec[edges] = {"edges": np.array(edges), "appear": np.zeros(nb), "expo": np.zeros(nb)}

    # ------------------------------------------------------------------ actualización
    def _bins(self, edges: np.ndarray) -> np.ndarray:
        b = np.searchsorted(edges, self.gap + 1, side="right") - 1  # gap+1 = intervalo si aparece ahora
        b = np.clip(b, 0, len(edges) - 1)
        b[~self.seen] = len(edges)
        return b

    def update(self, idx: int, weekday: int, month: int) -> None:
        # Recurrencia: exposición del estado ANTES de este sorteo y aparición observada
        for acc in self.rec.values():
            bins = self._bins(acc["edges"])
            np.add.at(acc["expo"], bins, self.base)
            if idx >= 0:
                acc["appear"][bins[idx]] += 1
        for h in self.ewma:
            decay = 0.5 ** (1.0 / h)
            self.ewma[h] *= decay
            self.ewma_w[h] = self.ewma_w[h] * decay
            if idx >= 0:
                self.ewma[h][idx] += 1.0
                self.ewma_w[h] += 1.0
        if idx >= 0:
            self.counts[idx] += 1
            self.wd_counts[weekday, idx] += 1
            self.month_counts[month, idx] += 1
            if self.last_idx >= 0:
                self.trans[self.last_idx, idx] += 1
            self.n_valid += 1
        self.gap += 1
        if idx >= 0:
            self.gap[idx] = 0
            self.seen[idx] = True
        self.last_idx = idx
        self.history.append(idx)
        self.n += 1

    # ------------------------------------------------------------------ predicción
    def _dirichlet(self, counts: np.ndarray, n: float, prior: np.ndarray, strength: float) -> np.ndarray:
        p = (counts + strength * prior) / (n + strength)
        return p / p.sum()

    def freq_all(self) -> np.ndarray:
        return self._dirichlet(self.counts, self.n_valid, self.base, self.alpha)

    def predict(self, spec: ModelSpec, target: Target) -> np.ndarray:
        t = spec.type
        if t == "baseline":
            return self.base.copy()
        if t == "frequency_all":
            return self.freq_all()
        if t == "frequency_recent":
            recent = np.array(self.history[-spec.window :], dtype=np.int64)
            recent = recent[recent >= 0]
            c = np.bincount(recent, minlength=self.D).astype(float)
            return self._dirichlet(c, len(recent), self.base, self.alpha)
        if t == "ewma":
            return self._dirichlet(self.ewma[spec.half_life], self.ewma_w[spec.half_life], self.base, self.alpha)
        if t in ("weekday", "month", "transition"):
            prior = self.freq_all()
            beta = spec.shrinkage if spec.shrinkage is not None else 100.0
            if t == "weekday":
                c = self.wd_counts[target.weekday]
            elif t == "month":
                c = self.month_counts[target.month]
            else:
                c = self.trans[self.last_idx] if self.last_idx >= 0 else np.zeros(self.D)
            return self._dirichlet(c, c.sum(), prior, beta)
        if t == "recurrence":
            acc = self.rec[tuple(spec.bin_edges or DEFAULT_BIN_EDGES)]
            kappa = spec.shrinkage if spec.shrinkage is not None else 20.0
            ratio = (acc["appear"] + kappa) / (acc["expo"] + kappa)  # contracción hacia 1 (sin efecto)
            p = self.base * ratio[self._bins(acc["edges"])]
            return p / p.sum()
        raise ValueError(f"Modelo desconocido: {t}")

    def predict_all(self, config: EngineConfig, target: Target) -> dict[str, np.ndarray]:
        out = {s.id: self.predict(s, target) for s in config.models}
        if config.ensemble_weights:
            total = sum(config.ensemble_weights.values())
            out["ensemble"] = sum(w * out[k] for k, w in config.ensemble_weights.items()) / total
            out["ensemble"] = out["ensemble"] / out["ensemble"].sum()
        return out

    def recurrence_ratio_for(self, spec: ModelSpec) -> np.ndarray:
        acc = self.rec[tuple(spec.bin_edges or DEFAULT_BIN_EDGES)]
        kappa = spec.shrinkage if spec.shrinkage is not None else 20.0
        return ((acc["appear"] + kappa) / (acc["expo"] + kappa))[self._bins(acc["edges"])]


def ranking(probs: np.ndarray, values: np.ndarray) -> np.ndarray:
    """Orden determinista: mayor probabilidad primero; empate → número menor primero."""
    return np.lexsort((values, -np.round(probs, 15)))
