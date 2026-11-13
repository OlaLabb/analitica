from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, get_game, require_admin
from app.db import get_db
from app.models import Game, HistoricalVersion, ModelConfiguration, Prediction, PredictionEvaluation, Profile
from app.services import jobs, predictions

router = APIRouter(tags=["Predicciones"])


def prediction_dict(db: Session, p: Prediction, with_candidates: bool = True) -> dict:
    hv = db.get(HistoricalVersion, p.historical_version_id)
    cfg = db.get(ModelConfiguration, p.configuration_id)
    ev = db.scalar(select(PredictionEvaluation).where(PredictionEvaluation.prediction_id == p.id,
                                                      PredictionEvaluation.kind == "live"))
    d = {
        "id": str(p.id), "game_id": p.game_id, "format": (p.support_metrics or {}).get("format", "positional_v1"),
        "kind": p.kind, "status": p.status, "target_date": p.target_date,
        "target_weekday": p.target_weekday, "generated_at": p.generated_at, "published_at": p.published_at,
        "superseded_at": p.superseded_at, "superseded_by_id": str(p.superseded_by_id) if p.superseded_by_id else None,
        "historical_version": {"number": hv.version_number, "draw_count": hv.draw_count,
                               "last_draw_date": hv.last_draw_date, "content_hash": hv.content_hash},
        "configuration": {"version_number": cfg.version_number, "name": cfg.name, "config_hash": cfg.config_hash},
        "algorithm_version": p.algorithm_version, "official_model": p.official_model, "data_scope": p.data_scope,
        "prediction_hash": p.prediction_hash, "input_hash": p.input_hash, "warnings": p.warnings,
        "support_metrics": p.support_metrics, "combinations": p.combinations,
        "evaluation": ev.results if ev else None,
    }
    if with_candidates:
        by_var: dict[str, list] = {}
        for c in sorted(p.candidates, key=lambda c: (c.variable, c.rank)):
            by_var.setdefault(c.variable, []).append({
                "rank": c.rank, "number": c.number, "score": c.score, "reference_prob": c.baseline_prob,
                "lift": c.lift, "uncertainty": c.uncertainty, "metrics": c.metrics,
                "factors": c.factors.get("models"), "explanation": c.factors.get("explanation"),
            })
        d["candidates"] = by_var
        d["params"] = p.params
    return d


@router.get("/games/{game_code}/predictions/official")
def official(target_date: date | None = None, game: Game = Depends(get_game), db: Session = Depends(get_db),
             _: Profile = Depends(get_current_user)):
    """Predicción oficial publicada (la misma para todos los usuarios)."""
    q = select(Prediction).where(Prediction.game_id == game.id, Prediction.kind == "official",
                                 Prediction.status == "published")
    q = q.where(Prediction.target_date == target_date) if target_date else q.order_by(Prediction.target_date.desc())
    p = db.scalar(q.limit(1))
    if p is None:
        raise HTTPException(404, "Aún no hay predicción oficial publicada")
    return prediction_dict(db, p)


@router.get("/games/{game_code}/predictions")
def list_predictions(kind: str = "official", include_superseded: bool = True, page: int = Query(1, ge=1),
                     page_size: int = Query(30, ge=1, le=200), game: Game = Depends(get_game),
                     db: Session = Depends(get_db), user: Profile = Depends(get_current_user)):
    q = select(Prediction).where(Prediction.game_id == game.id, Prediction.kind == kind)
    if kind == "experimental":
        if user.role != "admin":
            q = q.where(Prediction.created_by == user.id)
    if not include_superseded:
        q = q.where(Prediction.status != "superseded")
    total = db.scalar(select(func.count()).select_from(q.subquery()))
    rows = db.scalars(q.order_by(Prediction.target_date.desc(), Prediction.generated_at.desc())
                      .offset((page - 1) * page_size).limit(page_size))
    return {"total": total, "items": [prediction_dict(db, p, with_candidates=False) for p in rows]}


@router.get("/predictions/{prediction_id}")
def get_prediction(prediction_id: uuid.UUID, db: Session = Depends(get_db), user: Profile = Depends(get_current_user)):
    p = db.get(Prediction, prediction_id)
    if p is None or (p.kind == "experimental" and user.role != "admin" and p.created_by != user.id):
        raise HTTPException(404, "Predicción no encontrada")
    return prediction_dict(db, p)


@router.get("/predictions/{prediction_id}/explain")
def explain(prediction_id: uuid.UUID, variable: str, number: int, db: Session = Depends(get_db),
            _: Profile = Depends(get_current_user)):
    """¿Por qué el número X aparece en la variable Y? (datos almacenados al generar la predicción)."""
    p = db.get(Prediction, prediction_id)
    if p is None:
        raise HTTPException(404, "Predicción no encontrada")
    c = next((c for c in p.candidates if c.variable == variable and c.number == number), None)
    if c is None:
        raise HTTPException(404, "Ese número no está entre los candidatos almacenados para esa variable")
    return {"variable": variable, "number": number, "rank": c.rank, "score": c.score, "reference_prob": c.baseline_prob,
            "lift": c.lift, "metrics": c.metrics, "factors": c.factors.get("models"),
            "explanation": c.factors.get("explanation"), "uncertainty": c.uncertainty,
            "support": p.support_metrics.get(variable)}


class PublishIn(BaseModel):
    target_date: date | None = None


@router.post("/games/{game_code}/predictions/publish")
def publish(body: PublishIn, bg: BackgroundTasks, game: Game = Depends(get_game), db: Session = Depends(get_db),
            admin: Profile = Depends(require_admin)):
    job = jobs.enqueue(db, "publish_official", {"game_id": game.id,
                                                "target_date": body.target_date.isoformat() if body.target_date else None},
                       admin.id)
    db.commit()
    bg.add_task(jobs.run_job, job.id)
    return {"job_id": str(job.id)}


class ExperimentIn(BaseModel):
    params: dict
    target_date: date | None = None


@router.post("/games/{game_code}/predictions/experiments")
def experiment(body: ExperimentIn, game: Game = Depends(get_game), db: Session = Depends(get_db),
               admin: Profile = Depends(require_admin)):
    """Experimento con otra configuración. No altera la predicción oficial."""
    try:
        p = predictions.run_experiment(db, game, admin.id, body.params, body.target_date)
    except (ValueError, TypeError) as e:
        db.rollback()
        raise HTTPException(422, str(e))
    db.commit()
    return prediction_dict(db, p)
