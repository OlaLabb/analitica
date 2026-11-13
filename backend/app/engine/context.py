"""Contexto de análisis: dominios y distribuciones de referencia por variable.

Los dominios se infieren (si las reglas no los confirman) a partir del histórico COMPLETO, no de
la ventana, para que dos ventanas distintas se comparen sobre el mismo conjunto de valores.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from app.engine import MAIN_VARIABLES, VARIABLES
from app.engine.rules import Baseline, Domain, GameRules, baseline_for, domain_for


@dataclass
class AnalysisContext:
    rules: GameRules
    domains: dict[str, Domain]
    baselines: dict[str, Baseline]
    main_domain: Domain  # dominio común a las 5 posiciones

    def warnings(self, var: str) -> list[str]:
        return [*self.domains[var].warnings, *self.baselines[var].warnings]


def build_context(full: pd.DataFrame, rules: GameRules) -> AnalysisContext:
    main_obs = full[list(MAIN_VARIABLES)].to_numpy().ravel() if len(full) else np.array([])
    main_domain = domain_for("p1", rules, main_obs)
    sn_domain = domain_for("sn", rules, full["sn"].to_numpy() if len(full) else np.array([]))
    domains = {v: (sn_domain if v == "sn" else main_domain) for v in VARIABLES}
    baselines = {v: baseline_for(v, rules, domains[v]) for v in VARIABLES}
    return AnalysisContext(rules, domains, baselines, main_domain)


def counts_for(values: np.ndarray, domain: Domain) -> tuple[np.ndarray, int]:
    """Conteos sobre el dominio y cantidad de valores fuera de él."""
    idx = domain.index_of(np.asarray(values))
    valid = idx[idx >= 0]
    return np.bincount(valid, minlength=domain.size).astype(float), int((idx < 0).sum())
