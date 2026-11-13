"""Probabilidades EXACTAS de cada categoría de premio, calculadas con combinatoria.

Las categorías (p. ej. "4 + SB") NO se inventan: provienen de la configuración del juego, registrada
a partir de la tabla oficial de premios. La probabilidad de cada categoría es la misma para cualquier
combinación jugada: ningún número ni combinación es más probable que otro en un sorteo aleatorio.
"""
from __future__ import annotations

from math import comb

from app.engine.rules import N_MAIN, GameRules


def match_probability(D: int, k: int, n: int = N_MAIN) -> float:
    """P(acertar exactamente k de los n números) al jugar n números de D (hipergeométrica)."""
    if k < 0 or k > n:
        return 0.0
    return comb(n, k) * comb(D - n, n - k) / comb(D, n)


def category_probability(rules: GameRules, matches: int, super_match: bool) -> float:
    D = rules.main_max - rules.main_min + 1
    S = rules.super_max - rules.super_min + 1
    p_sb = 1 / S
    return match_probability(D, matches) * (p_sb if super_match else (1 - p_sb))


def odds_table(rules: GameRules, categories: list[dict] | None) -> dict:
    """Tabla de probabilidades por categoría + probabilidad de obtener algún premio."""
    if not (rules.main_range_known and rules.super_range_known and rules.main_unique):
        return {"available": False, "reason": "Las reglas del juego no están completamente confirmadas."}
    D = rules.main_max - rules.main_min + 1
    rows = []
    for c in categories or []:
        p = category_probability(rules, int(c["matches"]), bool(c["super"]))
        rows.append({"label": c.get("label") or f"{c['matches']}{' + SB' if c['super'] else ''}",
                     "matches": int(c["matches"]), "super": bool(c["super"]), "probability": p,
                     "one_in": round(1 / p) if p > 0 else None})
    any_prize = sum(r["probability"] for r in rows)
    return {
        "available": True,
        "categories": rows,
        "any_prize_probability": any_prize if rows else None,
        "any_prize_one_in": round(1 / any_prize) if rows and any_prize > 0 else None,
        "expected_matches_by_chance": N_MAIN * N_MAIN / D,
        "match_distribution": [{"matches": k, "probability": match_probability(D, k)} for k in range(N_MAIN + 1)],
        "note": "Estas probabilidades son idénticas para cualquier combinación de números.",
    }


def classify(matches: int, super_match: bool, categories: list[dict] | None) -> str | None:
    """Categoría de premio correspondiente a un resultado, o None si no está en la tabla oficial."""
    for c in categories or []:
        if int(c["matches"]) == matches and bool(c["super"]) == super_match:
            return c.get("label") or f"{matches}{' + SB' if super_match else ''}"
    return None
