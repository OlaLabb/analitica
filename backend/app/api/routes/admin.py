from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.routes.auth import user_dict
from app.config import get_settings
from app.core.deps import client_ip, get_game, require_admin
from app.core.security import hash_password, new_invitation_token
from app.db import get_db
from app.engine.numbers import ALGORITHM_VERSION_NUMBERS as ALGORITHM_VERSION
from app.engine.numbers import MODEL_DESCRIPTIONS, NumbersConfig
from app.models import AuditLog, Game, Invitation, ModelConfiguration, ModelVersion, ProcessingJob, Profile
from app.services import jobs, predictions
from app.services.audit import audit

router = APIRouter(prefix="/admin", tags=["Administración"])


# ------------------------------------------------------------------ usuarios
class UserCreate(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=1, max_length=200)
    role: str = Field("user", pattern="^(admin|user)$")
    password: str = Field(min_length=10, max_length=200)


class UserUpdate(BaseModel):
    full_name: str | None = None
    role: str | None = Field(None, pattern="^(admin|user)$")
    is_active: bool | None = None
    password: str | None = Field(None, min_length=10, max_length=200)


@router.get("/users")
def users(db: Session = Depends(get_db), _: Profile = Depends(require_admin)):
    return [user_dict(u) for u in db.scalars(select(Profile).order_by(Profile.created_at))]


@router.post("/users")
def create_user(body: UserCreate, request: Request, db: Session = Depends(get_db), admin: Profile = Depends(require_admin)):
    if db.scalar(select(Profile).where(func.lower(Profile.email) == body.email.lower())):
        raise HTTPException(409, "Ya existe un usuario con ese correo")
    u = Profile(email=body.email, full_name=body.full_name, role=body.role, password_hash=hash_password(body.password))
    db.add(u)
    db.flush()
    audit(db, "user.create", "profile", u.id, admin.id, after=user_dict(u), ip=client_ip(request))
    db.commit()
    return user_dict(u)


@router.patch("/users/{user_id}")
def update_user(user_id: uuid.UUID, body: UserUpdate, request: Request, db: Session = Depends(get_db),
                admin: Profile = Depends(require_admin)):
    u = db.get(Profile, user_id)
    if u is None:
        raise HTTPException(404, "Usuario no encontrado")
    if u.id == admin.id and (body.role == "user" or body.is_active is False):
        raise HTTPException(422, "No puede quitarse a sí mismo el rol de administrador ni desactivarse")
    before = user_dict(u)
    for k in ("full_name", "role", "is_active"):
        if getattr(body, k) is not None:
            setattr(u, k, getattr(body, k))
    if body.password:
        u.password_hash = hash_password(body.password)
    audit(db, "user.update", "profile", u.id, admin.id, before=before, after=user_dict(u),
          details={"password_changed": bool(body.password)}, ip=client_ip(request))
    db.commit()
    return user_dict(u)


class InvitationIn(BaseModel):
    email: EmailStr
    role: str = Field("user", pattern="^(admin|user)$")
    days_valid: int = Field(7, ge=1, le=60)


@router.post("/invitations")
def invite(body: InvitationIn, request: Request, db: Session = Depends(get_db), admin: Profile = Depends(require_admin)):
    """Crea una invitación. No se envía correo (sin servicios externos): el enlace se entrega al administrador."""
    token, token_hash = new_invitation_token()
    inv = Invitation(email=body.email, role=body.role, token_hash=token_hash, created_by=admin.id,
                     expires_at=datetime.now(timezone.utc) + timedelta(days=body.days_valid))
    db.add(inv)
    db.flush()
    audit(db, "user.invite", "invitation", inv.id, admin.id, after={"email": body.email, "role": body.role},
          ip=client_ip(request))
    db.commit()
    return {"id": str(inv.id), "email": inv.email, "token": token, "expires_at": inv.expires_at,
            "accept_path": f"/aceptar-invitacion?token={token}"}


# ------------------------------------------------------------------ configuración de modelos
@router.get("/models")
def models(db: Session = Depends(get_db), _: Profile = Depends(require_admin)):
    return {"algorithm_version": ALGORITHM_VERSION, "available_model_types": MODEL_DESCRIPTIONS,
            "versions": [{"algorithm_version": m.algorithm_version, "created_at": m.created_at}
                         for m in db.scalars(select(ModelVersion))]}


@router.get("/games/{game_code}/configurations")
def configurations(game: Game = Depends(get_game), db: Session = Depends(get_db), admin: Profile = Depends(require_admin)):
    predictions.active_config(db, game, admin.id)
    db.commit()
    rows = db.scalars(select(ModelConfiguration).where(ModelConfiguration.game_id == game.id)
                      .order_by(ModelConfiguration.version_number.desc()))
    return [{"id": c.id, "version_number": c.version_number, "name": c.name, "params": c.params,
             "config_hash": c.config_hash, "is_active": c.is_active, "notes": c.notes, "created_at": c.created_at}
            for c in rows]


class ConfigIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    params: dict
    activate: bool = False
    notes: str | None = None


@router.post("/games/{game_code}/configurations")
def create_configuration(body: ConfigIn, game: Game = Depends(get_game), db: Session = Depends(get_db),
                         admin: Profile = Depends(require_admin)):
    try:
        NumbersConfig(**body.params)
        c = predictions.create_config(db, game, body.name, body.params, admin.id, body.activate, body.notes)
    except (ValueError, TypeError) as e:
        db.rollback()
        raise HTTPException(422, str(e))
    db.commit()
    return {"id": c.id, "version_number": c.version_number, "is_active": c.is_active}


@router.post("/games/{game_code}/configurations/{config_id}/activate")
def activate_configuration(config_id: int, game: Game = Depends(get_game), db: Session = Depends(get_db),
                           admin: Profile = Depends(require_admin)):
    c = db.get(ModelConfiguration, config_id)
    if c is None or c.game_id != game.id:
        raise HTTPException(404, "Configuración no encontrada")
    for old in db.scalars(select(ModelConfiguration).where(ModelConfiguration.game_id == game.id,
                                                           ModelConfiguration.is_active.is_(True))):
        old.is_active = False
    db.flush()
    c.is_active = True
    audit(db, "config.activate", "model_configuration", c.id, admin.id, details={"game": game.code})
    db.commit()
    return {"ok": True}


# ------------------------------------------------------------------ auditoría, trabajos, reconstrucción
@router.get("/audit")
def audit_logs(action: str | None = None, entity_type: str | None = None, page: int = Query(1, ge=1),
               page_size: int = Query(100, ge=1, le=500), db: Session = Depends(get_db),
               _: Profile = Depends(require_admin)):
    q = select(AuditLog)
    if action:
        q = q.where(AuditLog.action.ilike(f"%{action}%"))
    if entity_type:
        q = q.where(AuditLog.entity_type == entity_type)
    total = db.scalar(select(func.count()).select_from(q.subquery()))
    rows = db.scalars(q.order_by(AuditLog.occurred_at.desc()).offset((page - 1) * page_size).limit(page_size))
    emails = {u.id: u.email for u in db.scalars(select(Profile))}
    return {"total": total, "items": [{
        "id": r.id, "occurred_at": r.occurred_at, "actor": emails.get(r.actor_id), "action": r.action,
        "entity_type": r.entity_type, "entity_id": r.entity_id, "before": r.before, "after": r.after,
        "details": r.details, "ip_address": r.ip_address} for r in rows]}


def job_dict(j: ProcessingJob) -> dict:
    return {"id": str(j.id), "job_type": j.job_type, "status": j.status, "params": j.params, "result": j.result,
            "error": j.error, "created_at": j.created_at, "started_at": j.started_at, "finished_at": j.finished_at}


@router.get("/jobs")
def list_jobs(db: Session = Depends(get_db), _: Profile = Depends(require_admin)):
    return [job_dict(j) for j in db.scalars(select(ProcessingJob).order_by(ProcessingJob.created_at.desc()).limit(100))]


@router.get("/jobs/{job_id}")
def get_job(job_id: uuid.UUID, db: Session = Depends(get_db), _: Profile = Depends(require_admin)):
    j = db.get(ProcessingJob, job_id)
    if j is None:
        raise HTTPException(404, "Trabajo no encontrado")
    return job_dict(j)


@router.post("/games/{game_code}/rebuild")
def rebuild(bg: BackgroundTasks, game: Game = Depends(get_game), db: Session = Depends(get_db),
            admin: Profile = Depends(require_admin)):
    job = jobs.enqueue(db, "rebuild", {"game_id": game.id}, admin.id)
    db.commit()
    bg.add_task(jobs.run_job, job.id)
    return {"job_id": str(job.id)}


@router.get("/system")
def system(_: Profile = Depends(require_admin)):
    s = get_settings()
    return {"environment": s.environment, "auth_provider": s.auth_provider, "auto_publish_on_new_data": s.auto_publish_on_new_data,
            "algorithm_version": ALGORITHM_VERSION, "assistant": {"provider": s.assistant_provider, "enabled": False}}
