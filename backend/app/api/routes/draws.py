from __future__ import annotations

from datetime import date

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.routes.games import version_dict
from app.config import get_settings
from app.core.deps import client_ip, get_current_user, get_game, require_admin
from app.db import get_db
from app.models import Draw, Game, HistoricalVersion, Profile
from app.services import history, jobs

router = APIRouter(prefix="/games/{game_code}", tags=["Histórico"])


def draw_dict(d: Draw) -> dict:
    return {"id": d.id, "draw_date": d.draw_date, "weekday": d.weekday, "draw_number": d.draw_number,
            "numbers": [d.position_1, d.position_2, d.position_3, d.position_4, d.position_5],
            "super_number": d.super_number, "valid_from_version": d.valid_from_version,
            "valid_to_version": d.valid_to_version, "supersedes_id": d.supersedes_id, "change_reason": d.change_reason,
            "source_import_id": str(d.source_import_id) if d.source_import_id else None}


@router.get("/draws")
def list_draws(game: Game = Depends(get_game), db: Session = Depends(get_db), _: Profile = Depends(get_current_user),
               start: date | None = None, end: date | None = None, weekday: int | None = Query(None, ge=0, le=6),
               number: int | None = None, version: int | None = None,
               page: int = Query(1, ge=1), page_size: int = Query(50, ge=1, le=500), order: str = "desc"):
    q = select(Draw).where(Draw.game_id == game.id)
    if version is None:
        q = q.where(Draw.valid_to_version.is_(None))
    else:
        q = q.where(history._valid_at(version))
    if start:
        q = q.where(Draw.draw_date >= start)
    if end:
        q = q.where(Draw.draw_date <= end)
    if weekday is not None:
        q = q.where(Draw.weekday == weekday)
    if number is not None:
        q = q.where((Draw.position_1 == number) | (Draw.position_2 == number) | (Draw.position_3 == number) |
                    (Draw.position_4 == number) | (Draw.position_5 == number) | (Draw.super_number == number))
    total = db.scalar(select(func.count()).select_from(q.subquery()))
    q = q.order_by(Draw.draw_date.desc() if order == "desc" else Draw.draw_date.asc())
    items = db.scalars(q.offset((page - 1) * page_size).limit(page_size))
    return {"total": total, "page": page, "page_size": page_size, "items": [draw_dict(d) for d in items]}


@router.get("/draws/{draw_id}/history")
def draw_history(draw_id: int, game: Game = Depends(get_game), db: Session = Depends(get_db),
                 _: Profile = Depends(get_current_user)):
    """Cadena de versiones de un sorteo (correcciones conservadas)."""
    d = db.get(Draw, draw_id)
    if d is None or d.game_id != game.id:
        raise HTTPException(404, "Sorteo no encontrado")
    chain = [d]
    while chain[-1].supersedes_id:
        chain.append(db.get(Draw, chain[-1].supersedes_id))
    nxt = db.scalar(select(Draw).where(Draw.supersedes_id == d.id))
    while nxt is not None:
        chain.insert(0, nxt)
        nxt = db.scalar(select(Draw).where(Draw.supersedes_id == nxt.id))
    return [draw_dict(x) for x in chain]


class DrawIn(BaseModel):
    draw_date: date
    numbers: list[int] = Field(min_length=5, max_length=5)
    super_number: int
    draw_number: int | None = None


class CorrectionIn(DrawIn):
    reason: str = Field(min_length=5, max_length=500)


class DeleteIn(BaseModel):
    reason: str = Field(min_length=5, max_length=500)


def _after_history_change(db: Session, game: Game, admin: Profile, bg: BackgroundTasks):
    if get_settings().auto_publish_on_new_data:
        job = jobs.enqueue(db, "publish_official", {"game_id": game.id}, admin.id)
        db.commit()
        bg.add_task(jobs.run_job, job.id)
        return str(job.id)
    db.commit()
    return None


@router.post("/draws")
def add_draw(body: DrawIn, request: Request, bg: BackgroundTasks, game: Game = Depends(get_game),
             db: Session = Depends(get_db), admin: Profile = Depends(require_admin)):
    try:
        hv = history.add_draws(db, game, [history.DrawInput(body.draw_date, body.numbers, body.super_number,
                                                            body.draw_number)], admin.id, "manual_add",
                               ip=client_ip(request))
    except ValueError as e:
        db.rollback()
        raise HTTPException(422, str(e))
    job_id = _after_history_change(db, game, admin, bg)
    return {"version": version_dict(hv), "publish_job_id": job_id}


@router.put("/draws/{draw_id}")
def correct(draw_id: int, body: CorrectionIn, request: Request, bg: BackgroundTasks, game: Game = Depends(get_game),
            db: Session = Depends(get_db), admin: Profile = Depends(require_admin)):
    try:
        hv = history.correct_draw(db, game, draw_id, history.DrawInput(body.draw_date, body.numbers, body.super_number,
                                                                       body.draw_number), body.reason, admin.id,
                                  client_ip(request))
    except ValueError as e:
        db.rollback()
        raise HTTPException(422, str(e))
    job_id = _after_history_change(db, game, admin, bg)
    return {"version": version_dict(hv), "publish_job_id": job_id}


@router.delete("/draws/{draw_id}")
def remove(draw_id: int, body: DeleteIn, request: Request, bg: BackgroundTasks, game: Game = Depends(get_game),
           db: Session = Depends(get_db), admin: Profile = Depends(require_admin)):
    try:
        hv = history.delete_draw(db, game, draw_id, body.reason, admin.id, client_ip(request))
    except ValueError as e:
        db.rollback()
        raise HTTPException(422, str(e))
    job_id = _after_history_change(db, game, admin, bg)
    return {"version": version_dict(hv), "publish_job_id": job_id}


@router.get("/versions")
def versions(game: Game = Depends(get_game), db: Session = Depends(get_db), _: Profile = Depends(get_current_user)):
    rows = db.scalars(select(HistoricalVersion).where(HistoricalVersion.game_id == game.id)
                      .order_by(HistoricalVersion.version_number.desc()))
    return [version_dict(v) for v in rows]
