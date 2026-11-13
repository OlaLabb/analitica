from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, get_game, require_admin
from app.db import get_db
from app.models import BacktestRun, Game, HistoricalVersion, ModelConfiguration, Prediction, PredictionEvaluation, Profile
from app.services import backtests, jobs

router = APIRouter(tags=["Evaluación y backtesting"])


def bt_dict(db: Session, b: BacktestRun, full: bool = False) -> dict:
    hv = db.get(HistoricalVersion, b.historical_version_id)
    cfg = db.get(ModelConfiguration, b.configuration_id)
    d = {"id": str(b.id), "status": b.status, "params": b.params, "seed": b.seed, "started_at": b.started_at,
         "finished_at": b.finished_at, "error": b.error, "historical_version": hv.version_number,
         "configuration_version": cfg.version_number,
         "format": (b.summary or {}).get("format", "positional_v1"),
         "draws": (b.summary or {}).get("draws", (b.summary or {}).get("n_targets")),
         "headline": (b.summary or {}).get("headline"), "conclusion": (b.summary or {}).get("conclusion")}
    if full:
        d["summary"] = b.summary
    return d


class BacktestIn(BaseModel):
    min_train: int = Field(100, ge=10)
    seed: int = 20240101


@router.post("/games/{game_code}/backtests")
def create(body: BacktestIn, bg: BackgroundTasks, game: Game = Depends(get_game), db: Session = Depends(get_db),
           admin: Profile = Depends(require_admin)):
    try:
        bt = backtests.create_backtest(db, game, body.model_dump(mode="json"), admin.id)
    except ValueError as e:
        db.rollback()
        raise HTTPException(422, str(e))
    job = jobs.enqueue(db, "backtest", {"game_id": game.id, "backtest_id": str(bt.id)}, admin.id)
    db.commit()
    bg.add_task(jobs.run_job, job.id)
    return {"backtest_id": str(bt.id), "job_id": str(job.id)}


@router.get("/games/{game_code}/backtests")
def list_bt(game: Game = Depends(get_game), db: Session = Depends(get_db), _: Profile = Depends(get_current_user)):
    rows = db.scalars(select(BacktestRun).where(BacktestRun.game_id == game.id).order_by(BacktestRun.started_at.desc()))
    return [bt_dict(db, b) for b in rows]


@router.get("/backtests/{backtest_id}")
def get_bt(backtest_id: uuid.UUID, db: Session = Depends(get_db), _: Profile = Depends(get_current_user)):
    b = db.get(BacktestRun, backtest_id)
    if b is None:
        raise HTTPException(404, "Backtest no encontrado")
    return bt_dict(db, b, full=True)


@router.get("/backtests/{backtest_id}/targets")
def bt_targets(backtest_id: uuid.UUID, model: str = "frecuencia_historica", page: int = Query(1, ge=1),
               page_size: int = Query(100, ge=1, le=1000), db: Session = Depends(get_db),
               _: Profile = Depends(get_current_user)):
    q = select(PredictionEvaluation).where(PredictionEvaluation.backtest_id == backtest_id,
                                           PredictionEvaluation.model_name == model)
    rows = db.scalars(q.order_by(PredictionEvaluation.target_date.desc()).offset((page - 1) * page_size).limit(page_size))
    return [{"target_date": r.target_date, "draw_id": r.draw_id, "results": r.results} for r in rows]


@router.get("/games/{game_code}/evaluations/live")
def live(game: Game = Depends(get_game), db: Session = Depends(get_db), _: Profile = Depends(get_current_user)):
    rows = db.execute(select(PredictionEvaluation, Prediction).join(Prediction, Prediction.id == PredictionEvaluation.prediction_id)
                      .where(Prediction.game_id == game.id, PredictionEvaluation.kind == "live")
                      .order_by(PredictionEvaluation.target_date.desc()))
    return [{"prediction_id": str(p.id), "status": p.status, "target_date": e.target_date, "results": e.results}
            for e, p in rows]


@router.get("/games/{game_code}/track-record")
def track_record(game: Game = Depends(get_game), db: Session = Depends(get_db), _: Profile = Depends(get_current_user)):
    """Marcador en lenguaje simple: aciertos reales de las predicciones oficiales + simulación histórica."""
    from app.engine.odds import match_probability
    from app.services import history as hist

    rows = db.execute(select(PredictionEvaluation, Prediction).join(Prediction, Prediction.id == PredictionEvaluation.prediction_id)
                      .where(Prediction.game_id == game.id, PredictionEvaluation.kind == "live",
                             Prediction.status == "published")
                      .order_by(PredictionEvaluation.target_date.desc())).all()
    live = [{"target_date": e.target_date, "prediction_id": str(p.id), **e.results} for e, p in rows
            if e.results.get("format") == "numbers_v1"]
    rules = hist.to_engine_rules(hist.active_rules_row(db, game))
    exp = None
    if rules.main_range_known:
        D = rules.main_max - rules.main_min + 1
        exp = sum(k * match_probability(D, k) for k in range(6))
    bt = db.scalar(select(BacktestRun).where(BacktestRun.game_id == game.id, BacktestRun.status == "completed")
                   .order_by(BacktestRun.started_at.desc()).limit(1))
    sim = None
    if bt and (bt.summary or {}).get("format") == "numbers_v1":
        s = bt.summary
        sim = {"backtest_id": str(bt.id), "draws": s["draws"], "first_date": s["first_date"],
               "last_date": s["last_date"], "headline": s["headline"], "conclusion": s["conclusion"],
               "strategies": s["strategies"], "official_strategy": s["official_strategy"]}
    n = len(live)
    return {
        "live": {
            "draws": n,
            "average_matches": round(sum(x["matches"] for x in live) / n, 4) if n else None,
            "expected_average_by_chance": round(exp, 4) if exp else None,
            "super_hits": sum(1 for x in live if x["super_hit"]),
            "with_prize": sum(1 for x in live if x.get("category")),
            "items": live,
        },
        "simulation": sim,
    }
