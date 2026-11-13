"""Pruebas del formato vigente: 5 números en cualquier orden + Súper Número (datos SINTÉTICOS)."""
from __future__ import annotations

from datetime import date
from math import comb

import numpy as np
import pytest

from app.engine.numbers import NumbersConfig, backtest_numbers, predict_numbers
from app.engine.odds import classify, match_probability, odds_table
from app.engine.rules import GameRules
from tests.synthetic import SYNTHETIC_PRIZES, synthetic_frame

RULES = GameRules(1, 43, 1, 16, True, "sorted_asc", (0, 2, 5))


def test_exact_odds():
    t = odds_table(RULES, SYNTHETIC_PRIZES)
    by = {c["label"]: c for c in t["categories"]}
    assert by["5 + SB"]["one_in"] == comb(43, 5) * 16 == 15_401_568
    assert by["5"]["probability"] == pytest.approx(15 / 16 / comb(43, 5))
    assert sum(match_probability(43, k) for k in range(6)) == pytest.approx(1.0)
    assert t["expected_matches_by_chance"] == pytest.approx(25 / 43)
    assert classify(1, True, SYNTHETIC_PRIZES) is None  # 1+SB no está en la tabla


def test_azar_prediction_reproducible_valid_and_exact():
    df = synthetic_frame(300)
    cfg = NumbersConfig()  # oficial = azar
    t = date(2030, 1, 2)
    a = predict_numbers(df, RULES, cfg, t, SYNTHETIC_PRIZES, seed_key="TEST")
    b = predict_numbers(df, RULES, cfg, t, SYNTHETIC_PRIZES, seed_key="TEST")
    assert a == b  # misma entrada ⇒ misma combinación (todos los usuarios ven lo mismo)
    nums = a["suggested"]["numbers"]
    assert nums == sorted(set(nums)) and len(nums) == 5 and 1 <= nums[0] and nums[-1] <= 43
    assert 1 <= a["suggested"]["super_number"] <= 16
    assert all(c["score"] == pytest.approx(5 / 43) for c in a["main"]["candidates"])
    other = predict_numbers(df, RULES, cfg, date(2030, 1, 4), SYNTHETIC_PRIZES, seed_key="TEST")
    assert other["suggested"] != a["suggested"] or other["prediction_hash"] != a["prediction_hash"]


def test_frequency_mode_ranks_by_any_position():
    df = synthetic_frame(200)
    df.loc[:, "p3"] = np.where(df.index % 2 == 0, 22, df["p3"])  # el 22 aparece en la mitad de los sorteos
    df[["p1", "p2", "p3", "p4", "p5"]] = np.sort(df[["p1", "p2", "p3", "p4", "p5"]].to_numpy(), axis=1)
    r = predict_numbers(df, RULES, NumbersConfig(official_model="frecuencia_historica"), date(2030, 1, 2),
                        SYNTHETIC_PRIZES)
    assert r["main"]["candidates"][0]["number"] == 22


def test_numbers_backtest_no_leakage_and_no_skill_on_uniform():
    df = synthetic_frame(400, seed=4)
    cfg = NumbersConfig()
    a = backtest_numbers(df, RULES, cfg, 100, SYNTHETIC_PRIZES)
    df2 = df.copy()
    df2.loc[300:, "sn"] = 1
    b = backtest_numbers(df2, RULES, cfg, 100, SYNTHETIC_PRIZES)
    for x, y in zip(a["per_draw"][:200], b["per_draw"][:200]):
        assert x["strategies"]["frecuencia_historica"] == y["strategies"]["frecuencia_historica"]
    assert all(r["verdict"] in ("referencia", "igual_que_el_azar") for r in a["strategies"])


def test_numbers_backtest_detects_real_bias():
    df = synthetic_frame(700, seed=22, sn_bias={3: 0.30, 7: 0.20})
    r = backtest_numbers(df, RULES, NumbersConfig(), 100, SYNTHETIC_PRIZES)
    freq = next(s for s in r["strategies"] if s["strategy"] == "frecuencia_historica")
    assert freq["verdict"] == "mejor_que_el_azar"
