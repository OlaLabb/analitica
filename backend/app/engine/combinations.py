"""Combinaciones conjuntas válidas.

Se buscan las K combinaciones de 5 números con mayor log-puntaje conjunto
Σ log p_k(x_k) (supuesto de independencia entre modelos por posición), sujetas a las reglas:
- main_order = sorted_asc: x1 < x2 < … < x5 (o ≤ si se permiten repeticiones)
- main_unique = True: sin repetidos

Algoritmo: búsqueda best-first (A*) con cota optimista admisible
(suma de máximos de las posiciones restantes) ⇒ resultado EXACTO y determinista.

Importante: bajo un sorteo uniforme, TODAS las combinaciones válidas tienen la misma probabilidad
real (1 / número de combinaciones). El puntaje conjunto solo ordena según los modelos.
"""
from __future__ import annotations

import heapq
from math import log

import numpy as np

from app.engine.rules import GameRules, total_main_combinations


class CombinationError(ValueError):
    pass


def can_build(rules: GameRules) -> tuple[bool, str | None]:
    if not rules.main_range_known:
        return False, "Rango de números principales no confirmado."
    if rules.main_unique is None:
        return False, "No está confirmado si los números principales pueden repetirse."
    if rules.main_order not in ("sorted_asc", "draw_order"):
        return False, "No está confirmado si las posiciones se publican ordenadas."
    return True, None


def top_combinations(position_probs: list[np.ndarray], values: np.ndarray, rules: GameRules, k: int,
                     baselines: list[np.ndarray] | None = None, max_expansions: int = 2_000_000) -> list[dict]:
    """Si se pasan ``baselines`` el criterio es Σ log(p_k / π0_k): cuánto favorecen los modelos a la
    combinación FRENTE al azar. Sin ellas, Σ log p_k (dominado por la forma de la distribución teórica,
    p. ej. 1 en la posición 1 y 43 en la 5 cuando los números se publican ordenados).

    El criterio por lift NO se usa en la predicción oficial: favorece valores con probabilidad de
    referencia diminuta (p. ej. 31 en la posición 1), amplifica ruido y en el backtesting walk-forward
    sobre BALOTO rindió peor que una combinación aleatoria."""
    ok, why = can_build(rules)
    if not ok:
        raise CombinationError(why)
    logp = [np.log(np.clip(p, 1e-300, None)) for p in position_probs]
    if baselines is not None:
        # valores imposibles bajo la referencia (π0 = 0) quedan excluidos
        logp = [np.where(b > 0, lp - np.log(np.clip(b, 1e-300, None)), -1e9) for lp, b in zip(logp, baselines)]
    # orden de candidatos por posición (determinista)
    order = [np.lexsort((values, -lp)) for lp in logp]
    best_rest = np.zeros(len(logp) + 1)
    for i in range(len(logp) - 1, -1, -1):
        best_rest[i] = best_rest[i + 1] + logp[i].max()
    sorted_mode = rules.main_order == "sorted_asc"
    strict = bool(rules.main_unique)

    def valid_next(partial: tuple[int, ...], j: int) -> bool:
        if not partial:
            return True
        if sorted_mode:
            return values[j] > values[partial[-1]] if strict else values[j] >= values[partial[-1]]
        return (j not in partial) if strict else True

    # heap: (-cota, desempate, parcial, puntaje)
    heap: list = [(-best_rest[0], (), (), 0.0)]
    results = []
    expansions = 0
    while heap and len(results) < k:
        neg_bound, _, partial, score = heapq.heappop(heap)
        pos = len(partial)
        if pos == len(logp):
            results.append((score, partial))
            continue
        expansions += 1
        if expansions > max_expansions:
            break
        for j in order[pos]:
            if not valid_next(partial, int(j)):
                continue
            s = score + logp[pos][j]
            bound = s + best_rest[pos + 1]
            child = partial + (int(j),)
            tie = tuple(int(values[x]) for x in child)
            heapq.heappush(heap, (-bound, tie, child, s))
    total = total_main_combinations(rules)
    return [{
        "numbers": [int(values[j]) for j in partial],
        "log_score": float(score),
        "criterion": "log_lift_vs_reference" if baselines is not None else "log_prob",
        "lift_vs_reference": float(np.exp(score)) if baselines is not None else None,
        "per_position_prob": [float(position_probs[i][j]) for i, j in enumerate(partial)],
        "reference_prob_under_uniform": (1.0 / total) if total else None,
    } for score, partial in results]


def independent_argmax(position_probs: list[np.ndarray], values: np.ndarray, rules: GameRules) -> dict:
    """Top-1 de cada posición por separado y si esa combinación respeta las reglas."""
    nums = [int(values[np.lexsort((values, -p))[0]]) for p in position_probs]
    valid = True
    if rules.main_unique and len(set(nums)) < len(nums):
        valid = False
    if rules.main_order == "sorted_asc":
        valid = valid and all((a < b) if rules.main_unique else (a <= b) for a, b in zip(nums, nums[1:]))
    return {"numbers": nums, "valid": valid}


def random_valid_combination(rules: GameRules, rng: np.random.Generator) -> list[int]:
    """Combinación aleatoria que respeta exactamente las reglas (línea base de azar)."""
    lo, hi = rules.main_min, rules.main_max
    pool = np.arange(lo, hi + 1)
    nums = rng.choice(pool, size=5, replace=not rules.main_unique)
    if rules.main_order == "sorted_asc":
        nums = np.sort(nums)
    return [int(x) for x in nums]


def log_uniform_combo_prob(rules: GameRules) -> float | None:
    total = total_main_combinations(rules)
    return -log(total) if total else None
