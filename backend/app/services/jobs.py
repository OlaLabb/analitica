"""Trabajos en segundo plano con estado consultable (tabla processing_jobs).

La ejecución ocurre en un hilo del proceso de la API (FastAPI BackgroundTasks). Cada trabajo
abre su propia sesión y transacción; si falla, se hace rollback y se registra el error, sin dejar
resultados parciales publicados.
"""
from __future__ import annotations

import logging
import traceback
import uuid
from datetime import date, datetime, timezone

from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.models import BacktestRun, Game, ProcessingJob
from app.services import backtests, history, predictions
from app.services.audit import audit

log = logging.getLogger(__name__)


def enqueue(db: Session, job_type: str, params: dict, actor: uuid.UUID | None) -> ProcessingJob:
    job = ProcessingJob(job_type=job_type, status="queued", params=params, created_by=actor)
    db.add(job)
    db.flush()
    return job


def run_job(job_id: uuid.UUID) -> None:
    db = SessionLocal()
    try:
        job = db.get(ProcessingJob, job_id)
        job.status, job.started_at = "running", datetime.now(timezone.utc)
        db.commit()
        try:
            result = _dispatch(db, job)
            job.result, job.status = result, "succeeded"
            job.finished_at = datetime.now(timezone.utc)
            db.commit()
        except Exception as e:  # noqa: BLE001
            db.rollback()
            log.exception("Trabajo %s falló", job_id)
            job = db.get(ProcessingJob, job_id)
            job.status, job.error = "failed", f"{e}\n{traceback.format_exc(limit=3)}"
            job.finished_at = datetime.now(timezone.utc)
            if job.job_type == "backtest" and job.params.get("backtest_id"):
                bt = db.get(BacktestRun, uuid.UUID(job.params["backtest_id"]))
                if bt:
                    bt.status, bt.error = "failed", str(e)
            db.commit()
    finally:
        db.close()


def _dispatch(db: Session, job: ProcessingJob) -> dict:
    p = job.params
    game = db.get(Game, p["game_id"]) if "game_id" in p else None
    if job.job_type == "publish_official":
        td = date.fromisoformat(p["target_date"]) if p.get("target_date") else None
        n_eval = predictions.evaluate_pending(db, game)
        pred, created = predictions.publish_official(db, game, job.created_by, td)
        return {"prediction_id": str(pred.id), "created": created, "target_date": pred.target_date.isoformat(),
                "evaluated": n_eval}
    if job.job_type == "backtest":
        bt = db.get(BacktestRun, uuid.UUID(p["backtest_id"]))
        summary = backtests.execute_backtest(db, bt)
        return {"backtest_id": str(bt.id), "draws": summary["draws"], "conclusion": summary["conclusion"]}
    if job.job_type == "rebuild":
        hv = history.current_version(db, game)
        if hv is None:
            return {"rebuilt": False}
        snap = history.update_snapshot(db, game, hv, force_full=True)
        audit(db, "engine.rebuild", "statistical_snapshot", snap.id, job.created_by, details={"game": game.code})
        return {"rebuilt": True, "snapshot_hash": snap.payload_hash, "version": hv.version_number}
    raise ValueError(f"Tipo de trabajo desconocido: {job.job_type}")
