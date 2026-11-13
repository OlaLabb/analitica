"""Pruebas del motor estadístico puro (sin base de datos)."""
from __future__ import annotations

import itertools
from datetime import date

import numpy as np
import pandas as pd
import pytest

from app.engine import MAIN_VARIABLES, VARIABLES
from app.engine.backtest import run_backtest
from app.engine.combinations import CombinationError, random_valid_combination, top_combinations
from app.engine.config import EngineConfig, ModelSpec, default_config
from app.engine.context import build_context
from app.engine.data import WindowSpec, make_frame, select_window
from app.engine.frequencies import frequency_table
from app.engine.models import Target, VariableState
from app.engine.predictor import build_states, predict
from app.engine.recurrence import recurrence_table
from app.engine.rules import GameRules, baseline_for, domain_for
from app.engine.snapshots import apply_draws, build_full, snapshot_hash
from tests.synthetic import synthetic_frame

RULES = GameRules(1, 43, 1, 16, True, "sorted_asc", (0, 2, 5))


# ------------------------------------------------------------------ reglas y referencias
def test_order_statistic_baselines_are_valid_distributions():
    dom = domain_for("p1", RULES)
    means = []
    for v in MAIN_VARIABLES:
        b = baseline_for(v, RULES, dom)
        assert b.theoretical
        assert b.probs.sum() == pytest.approx(1.0)
        means.append((dom.values * b.probs).sum())
    # E[X_(k)] = k (N+1)/(n+1) para muestreo sin reposición
    assert means == pytest.approx([k * 44 / 6 for k in range(1, 6)])
    # el 43 es imposible en la posición 1 y el 1 en la posición 5
    assert baseline_for("p1", RULES, dom).probs[-1] == 0
    assert baseline_for("p5", RULES, dom).probs[0] == 0


def test_unknown_rules_are_not_assumed():
    df = synthetic_frame(50)
    ctx = build_context(df, GameRules())
    assert ctx.domains["p1"].source == "inferred"
    assert not ctx.baselines["p1"].theoretical
    assert ctx.warnings("p1")


# ------------------------------------------------------------------ frecuencias, recurrencia, ventanas
def _tiny():
    rows = [
        {"draw_id": 1, "draw_date": "2024-01-01", "p1": 1, "p2": 2, "p3": 3, "p4": 4, "p5": 5, "sn": 1},
        {"draw_id": 2, "draw_date": "2024-01-03", "p1": 1, "p2": 7, "p3": 8, "p4": 9, "p5": 10, "sn": 2},
        {"draw_id": 3, "draw_date": "2024-01-06", "p1": 2, "p2": 3, "p3": 8, "p4": 20, "p5": 43, "sn": 1},
        {"draw_id": 4, "draw_date": "2024-01-08", "p1": 1, "p2": 3, "p3": 9, "p4": 30, "p5": 40, "sn": 1},
    ]
    return make_frame(rows)


def test_frequencies_respect_position_identity():
    df = _tiny()
    ctx = build_context(df, RULES)
    f1 = {r["number"]: r["count"] for r in frequency_table(df, "p1", ctx)["rows"]}
    f2 = {r["number"]: r["count"] for r in frequency_table(df, "p2", ctx)["rows"]}
    assert f1[1] == 3 and f1[2] == 1
    assert f2[3] == 2 and f2[1] == 0  # el 1 nunca salió en la posición 2
    sn = {r["number"]: r["count"] for r in frequency_table(df, "sn", ctx)["rows"]}
    assert sn[1] == 3 and sn[2] == 1


def test_recurrence_gaps():
    df = _tiny()
    ctx = build_context(df, RULES)
    rows = {r["number"]: r for r in recurrence_table(df, "p1", ctx)["rows"]}
    # el 1 en posición 1 aparece en sorteos 0,1,3 → intervalos 1 y 2; última aparición en el último sorteo
    assert rows[1]["gap_min"] == 1 and rows[1]["gap_max"] == 2 and rows[1]["gap_mean"] == 1.5
    assert rows[1]["draws_since_last"] == 0
    assert rows[2]["draws_since_last"] == 1
    assert rows[5]["never_seen"]


def test_windows():
    df = synthetic_frame(400)
    last = df["draw_date"].max()
    w = select_window(df, WindowSpec(mode="last_n_draws", n=100))
    assert w.n_draws == 100 and w.last_date == last.date().isoformat()
    w = select_window(df, WindowSpec(mode="last_n_years", n=1))
    assert (w.frame["draw_date"] > last - pd.DateOffset(years=1)).all()
    w = select_window(df, WindowSpec(mode="all", months=[1], weekdays=[0]))
    assert set(w.frame["draw_date"].dt.month) == {1} and set(w.frame["weekday"]) == {0}
    w = select_window(df, WindowSpec(mode="date_range", start=date(2020, 3, 1), end=date(2020, 3, 31)))
    assert w.frame["draw_date"].min() >= pd.Timestamp("2020-03-01")
    w = select_window(df, WindowSpec(mode="years", years=[1999]))
    assert w.n_draws == 0 and w.warnings
    # el histórico completo no se altera
    assert len(df) == 400


def test_history_of_any_length():
    for n in (12, 150, 2500):  # sin límite artificial de años
        df = synthetic_frame(n)
        ctx = build_context(df, RULES)
        r = predict(df, ctx, default_config(), (df["draw_date"].max() + pd.Timedelta(days=2)).date())
        assert all(len(v["candidates"]) == 5 for v in r["variables"].values())


# ------------------------------------------------------------------ predicción
def test_prediction_is_deterministic():
    df = synthetic_frame(300)
    ctx = build_context(df, RULES)
    t = date(2030, 1, 2)
    a, b = predict(df, ctx, default_config(), t), predict(df, ctx, default_config(), t)
    assert a["prediction_hash"] == b["prediction_hash"]
    assert a == b


def test_prediction_rejects_leakage():
    df = synthetic_frame(100)
    ctx = build_context(df, RULES)
    with pytest.raises(ValueError):
        predict(df, ctx, default_config(), df["draw_date"].iloc[50].date())


def test_no_leakage_in_backtest():
    """Modificar sorteos POSTERIORES no puede cambiar las predicciones de sorteos anteriores."""
    df = synthetic_frame(220, seed=3)
    ctx = build_context(df, RULES)
    cfg = default_config()
    a = run_backtest(df, ctx, cfg, start_index=100, end_index=150, evaluate_combinations=False)
    df2 = df.copy()
    df2.loc[150:, "sn"] = 1  # futuro alterado
    b = run_backtest(df2, ctx, cfg, start_index=100, end_index=150, evaluate_combinations=False)
    assert a["per_target"] == b["per_target"]


def test_incremental_state_equals_batch():
    df = synthetic_frame(300, seed=11)
    ctx = build_context(df, RULES)
    cfg = default_config()
    batch = build_states(df, ctx, cfg)
    inc = build_states(df.iloc[:200], ctx, cfg)
    idx = {v: ctx.domains[v].index_of(df[v].to_numpy()) for v in VARIABLES}
    for t in range(200, 300):
        for v in VARIABLES:
            inc[v].update(int(idx[v][t]), int(df["weekday"].iloc[t]), int(df["draw_date"].iloc[t].month))
    tgt = Target(2, 6)
    for v in VARIABLES:
        pa, pb = batch[v].predict_all(cfg, tgt), inc[v].predict_all(cfg, tgt)
        for m in pa:
            np.testing.assert_array_equal(pa[m], pb[m])


def test_snapshot_incremental_equals_full():
    df = synthetic_frame(500, seed=5)
    dom = {v: ((1, 16) if v == "sn" else (1, 43)) for v in VARIABLES}
    full = build_full(df, dom)
    inc = apply_draws(apply_draws(build_full(df.iloc[:300], dom), df.iloc[300:450]), df.iloc[450:])
    assert snapshot_hash(full) == snapshot_hash(inc)
    with pytest.raises(ValueError):
        apply_draws(full, df.iloc[10:20])  # no es seguro: fechas anteriores


# ------------------------------------------------------------------ combinaciones
def test_combinations_valid_and_exact():
    small = GameRules(1, 9, 1, 4, True, "sorted_asc", (0,))
    values = np.arange(1, 10)
    rng = np.random.default_rng(0)
    probs = [rng.dirichlet(np.ones(9)) for _ in range(5)]
    top = top_combinations(probs, values, small, 10)
    # fuerza bruta
    brute = sorted(((sum(np.log(probs[i][c[i] - 1]) for i in range(5)), c)
                    for c in itertools.combinations(range(1, 10), 5)), reverse=True)[:10]
    assert [t["numbers"] for t in top] == [list(c) for _, c in brute]
    for t in top:
        assert t["numbers"] == sorted(set(t["numbers"]))


def test_combinations_require_confirmed_rules():
    with pytest.raises(CombinationError):
        top_combinations([np.ones(43) / 43] * 5, np.arange(1, 44), GameRules(1, 43), 3)


def test_random_baseline_respects_rules():
    rng = np.random.default_rng(1)
    for _ in range(200):
        c = random_valid_combination(RULES, rng)
        assert c == sorted(set(c)) and len(c) == 5 and 1 <= c[0] and c[-1] <= 43


# ------------------------------------------------------------------ comparación con azar
def _small_cfg() -> EngineConfig:
    return EngineConfig(models=[ModelSpec(id="baseline", type="baseline"),
                                ModelSpec(id="frequency_all", type="frequency_all")],
                        ensemble_weights={"frequency_all": 1}, official_model="ensemble")


def test_backtest_uniform_data_shows_no_skill():
    df = synthetic_frame(700, seed=21)
    ctx = build_context(df, RULES)
    s = run_backtest(df, ctx, _small_cfg(), start_index=100, evaluate_combinations=False)["summary"]
    assert all(r["verdict"] in ("referencia", "sin_mejora_significativa", "evidencia_parcial") for r in s["rows"])
    assert not any(r["verdict"] == "mejora_significativa" for r in s["rows"])


def test_backtest_detects_real_bias():
    """Control de potencia: con un SN fuertemente sesgado, el modelo de frecuencia debe superar al azar."""
    df = synthetic_frame(700, seed=22, sn_bias={3: 0.30, 7: 0.20})
    ctx = build_context(df, RULES)
    s = run_backtest(df, ctx, _small_cfg(), start_index=100, evaluate_combinations=False)["summary"]
    row = next(r for r in s["rows"] if r["model"] == "frequency_all" and r["variable"] == "sn")
    assert row["verdict"] == "mejora_significativa"
    assert row["logloss_diff"] < 0
