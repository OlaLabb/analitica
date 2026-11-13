"""Reglas del juego, dominios de valores y distribuciones teóricas bajo la hipótesis de azar.

Nada aquí inventa reglas: cada campo puede ser ``None`` (no confirmado). Cuando falta información,
las funciones lo indican con ``theoretical_available = False`` y advertencias explícitas.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from math import comb

import numpy as np

from app.engine import MAIN_VARIABLES

N_MAIN = 5


@dataclass(frozen=True)
class GameRules:
    main_min: int | None = None
    main_max: int | None = None
    super_min: int | None = None
    super_max: int | None = None
    main_unique: bool | None = None  # True: los 5 principales no se repiten dentro de un sorteo
    main_order: str = "unknown"  # 'sorted_asc' | 'draw_order' | 'unknown'
    draw_weekdays: tuple[int, ...] | None = None  # 0=lunes … 6=domingo

    @property
    def main_range_known(self) -> bool:
        return self.main_min is not None and self.main_max is not None

    @property
    def super_range_known(self) -> bool:
        return self.super_min is not None and self.super_max is not None

    @property
    def fully_confirmed(self) -> bool:
        return (
            self.main_range_known
            and self.super_range_known
            and self.main_unique is not None
            and self.main_order in ("sorted_asc", "draw_order")
        )

    def to_dict(self) -> dict:
        return {
            "main_min": self.main_min,
            "main_max": self.main_max,
            "super_min": self.super_min,
            "super_max": self.super_max,
            "main_unique": self.main_unique,
            "main_order": self.main_order,
            "draw_weekdays": list(self.draw_weekdays) if self.draw_weekdays is not None else None,
        }


@dataclass
class Domain:
    """Valores posibles de una variable."""

    values: np.ndarray  # enteros ordenados
    source: str  # 'rules' | 'inferred'
    warnings: list[str] = field(default_factory=list)

    @property
    def size(self) -> int:
        return int(len(self.values))

    def index_of(self, arr: np.ndarray) -> np.ndarray:
        """Índices en el dominio; -1 si el valor está fuera del dominio."""
        lo = int(self.values[0])
        idx = np.asarray(arr, dtype=np.int64) - lo
        idx[(idx < 0) | (idx >= self.size)] = -1
        return idx


def domain_for(var: str, rules: GameRules, observed: np.ndarray | None = None) -> Domain:
    if var == "sn":
        lo, hi = rules.super_min, rules.super_max
    else:
        lo, hi = rules.main_min, rules.main_max
    if lo is not None and hi is not None:
        return Domain(np.arange(lo, hi + 1), "rules")
    if observed is None or len(observed) == 0:
        return Domain(np.arange(0, 1), "inferred", ["Sin reglas ni datos: dominio vacío"])
    lo_o, hi_o = int(np.min(observed)), int(np.max(observed))
    return Domain(
        np.arange(lo_o, hi_o + 1),
        "inferred",
        [
            "Rango no confirmado en las reglas del juego: se usa el rango observado "
            f"[{lo_o}, {hi_o}]. Valores nunca observados fuera de ese rango no se consideran."
        ],
    )


@dataclass
class Baseline:
    """Distribución de referencia bajo la hipótesis de sorteo aleatorio."""

    probs: np.ndarray
    theoretical: bool  # True si se deriva de reglas confirmadas
    description: str
    warnings: list[str] = field(default_factory=list)


def _order_stat_without_replacement(N: int, n: int, k: int) -> np.ndarray:
    """P(X_(k) = x) para x = 1..N al extraer n de N sin reposición y ordenar ascendentemente."""
    total = comb(N, n)
    return np.array([comb(x - 1, k - 1) * comb(N - x, n - k) / total for x in range(1, N + 1)], dtype=float)


def _order_stat_with_replacement(N: int, n: int, k: int) -> np.ndarray:
    """P(X_(k) = x) para n extracciones iid uniformes en 1..N, ordenadas ascendentemente."""
    from scipy.stats import binom

    F = np.arange(0, N + 1) / N  # F(x) para x = 0..N
    # P(X_(k) <= x) = P(Bin(n, F(x)) >= k)
    cdf = binom.sf(k - 1, n, F)
    return np.diff(cdf)


def baseline_for(var: str, rules: GameRules, domain: Domain) -> Baseline:
    D = domain.size
    uniform = np.full(D, 1.0 / D) if D else np.zeros(0)
    if domain.source != "rules":
        return Baseline(
            uniform,
            False,
            "Uniforme sobre el rango observado (referencia, no confirmada por reglas)",
            ["La distribución teórica requiere reglas confirmadas por el administrador."],
        )
    if var == "sn":
        return Baseline(uniform, True, "Uniforme discreta sobre el rango del Súper Número")
    k = MAIN_VARIABLES.index(var) + 1
    if rules.main_order == "draw_order":
        return Baseline(uniform, True, "Uniforme: en orden de extracción cada posición es marginalmente uniforme")
    if rules.main_order == "sorted_asc":
        if rules.main_unique is True:
            if D < N_MAIN:
                return Baseline(uniform, False, "Rango menor que 5 números", ["Reglas inconsistentes"])
            return Baseline(
                _order_stat_without_replacement(D, N_MAIN, k),
                True,
                f"Estadístico de orden {k} de 5 extraídos sin reposición de {D} (hipergeométrica)",
            )
        if rules.main_unique is False:
            return Baseline(
                _order_stat_with_replacement(D, N_MAIN, k),
                True,
                f"Estadístico de orden {k} de 5 extracciones con reposición de {D}",
            )
        return Baseline(uniform, False, "Uniforme (referencia)", ["No está confirmado si hay repetición."])
    return Baseline(
        uniform,
        False,
        "Uniforme (referencia)",
        [
            "No está confirmado si las posiciones se publican ordenadas o en orden de extracción; "
            "si están ordenadas, la distribución real de cada posición NO es uniforme."
        ],
    )


def pooled_main_probability(rules: GameRules, domain: Domain) -> tuple[float, bool]:
    """P(un número concreto aparezca entre los 5 principales de un sorteo)."""
    D = domain.size
    if D == 0:
        return 0.0, False
    if rules.main_unique is True and domain.source == "rules":
        return N_MAIN / D, True
    if rules.main_unique is False and domain.source == "rules":
        return 1 - (1 - 1 / D) ** N_MAIN, True
    return N_MAIN / D, False


def pair_probability(rules: GameRules, domain: Domain) -> tuple[float, bool]:
    """P(un par concreto {a, b} aparezca en un sorteo), números principales sin reposición."""
    D = domain.size
    if D < 2:
        return 0.0, False
    p = N_MAIN * (N_MAIN - 1) / (D * (D - 1))
    return p, bool(rules.main_unique is True and domain.source == "rules")


def total_main_combinations(rules: GameRules) -> int | None:
    if not rules.main_range_known or rules.main_unique is None:
        return None
    D = rules.main_max - rules.main_min + 1  # type: ignore[operator]
    if rules.main_unique:
        n = comb(D, N_MAIN)
        return n if rules.main_order == "sorted_asc" else n * 120 if rules.main_order == "draw_order" else None
    if rules.main_order == "sorted_asc":
        return comb(D + N_MAIN - 1, N_MAIN)
    if rules.main_order == "draw_order":
        return D**N_MAIN
    return None
