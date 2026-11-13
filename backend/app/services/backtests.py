from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import insert
from sqlalchemy.orm import Session

from app.engine.numbers import NumbersConfig, backtest_numbers
from app.models import BacktestRun, Game, HistoricalVersion, ModelConfiguration, PredictionEvaluation
from app.services import history
from app.services.predictions import active_config, ensure_model_version


def create_backtest(db: Session, game: Game, params: dict, actor: uuid.UUID | None) -> BacktestRun:
    hv = history.current_version(db, game)
    if hv is None or hv.draw_count < 20:
        raise ValueError("Se necesitan al menos 20 sorteos para evaluar")
    cfg_row = active_config(db, game, actor)
    rules_row = history.active_rules_row(db, game)
    bt = BacktestRun(game_id=game.id, status="running", historical_version_id=hv.id,
                     model_version_id=ensure_model_version(db).id, configuration_id=cfg_row.id,
                     game_rules_id=rules_row.id if rules_row else None, params=params,
                     seed=int(params.get("seed", 20240101)), created_by=actor)
    db.add(bt)
    db.flush()
    return bt


def execute_backtest(db: Session, bt: BacktestRun) -> dict:
    """Simula, sorteo por sorteo, qué habría jugado el sistema usando solo los sorteos anteriores."""
    game = db.get(Game, bt.game_id)
    hv = db.get(HistoricalVersion, bt.historical_version_id)
    cfg_row = db.get(ModelConfiguration, bt.configuration_id)
    cfg = NumbersConfig(**cfg_row.params)
    frame = history.load_frame(db, game, hv.version_number)
    rules_row = history.active_rules_row(db, game)
    rules = history.to_engine_rules(rules_row)
    start = int(bt.params.get("min_train", cfg.backtest_min_train))
    res = backtest_numbers(frame, rules, cfg, start, rules_row.prize_categories if rules_row else None, bt.seed)
    ids = dict(zip(frame["draw_date"].dt.date.astype(str), frame["draw_id"]))
    rows = []
    for d in res.pop("per_draw"):
        for strategy, r in d["strategies"].items():
            rows.append({"kind": "backtest", "backtest_id": bt.id, "model_name": strategy,
                         "draw_id": int(ids[d["date"]]), "target_date": d["date"],
                         "results": {**r, "actual": d["actual"], "actual_super": d["actual_sn"]}})
    for i in range(0, len(rows), 2000):
        db.execute(insert(PredictionEvaluation), rows[i:i + 2000])
    bt.summary = {**res, "historical_version": hv.version_number, "configuration_version": cfg_row.version_number}
    bt.status = "completed"
    bt.finished_at = datetime.now(timezone.utc)
    return bt.summary
