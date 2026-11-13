from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.core.deps import client_ip, get_current_user
from app.core.security import create_access_token, hash_password, hash_token, verify_password
from app.db import get_db
from app.models import Invitation, Profile
from app.services.audit import audit

router = APIRouter(prefix="/auth", tags=["Autenticación"])


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=200)


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: dict


class AcceptInvitationIn(BaseModel):
    token: str
    full_name: str = Field(min_length=1, max_length=200)
    password: str = Field(min_length=10, max_length=200)


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=10, max_length=200)


def user_dict(u: Profile) -> dict:
    return {"id": str(u.id), "email": u.email, "full_name": u.full_name, "role": u.role, "is_active": u.is_active,
            "last_login_at": u.last_login_at.isoformat() if u.last_login_at else None}


@router.post("/login", response_model=TokenOut)
def login(body: LoginIn, request: Request, db: Session = Depends(get_db)):
    if get_settings().auth_provider != "local":
        raise HTTPException(400, "El inicio de sesión lo gestiona Supabase en este entorno")
    u = db.scalar(select(Profile).where(func.lower(Profile.email) == body.email.lower()))
    if u is None or not u.is_active or not verify_password(body.password, u.password_hash):
        audit(db, "auth.login_failed", "profile", None, details={"email": body.email}, ip=client_ip(request))
        db.commit()
        raise HTTPException(401, "Credenciales inválidas")
    u.last_login_at = datetime.now(timezone.utc)
    audit(db, "auth.login", "profile", u.id, u.id, ip=client_ip(request))
    db.commit()
    token, exp = create_access_token(str(u.id), u.role)
    return TokenOut(access_token=token, expires_in=exp, user=user_dict(u))


@router.get("/me")
def me(user: Profile = Depends(get_current_user)):
    return user_dict(user)


@router.post("/change-password")
def change_password(body: ChangePasswordIn, request: Request, user: Profile = Depends(get_current_user),
                    db: Session = Depends(get_db)):
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(400, "La contraseña actual no es correcta")
    user.password_hash = hash_password(body.new_password)
    audit(db, "auth.change_password", "profile", user.id, user.id, ip=client_ip(request))
    db.commit()
    return {"ok": True}


@router.post("/accept-invitation", response_model=TokenOut)
def accept_invitation(body: AcceptInvitationIn, request: Request, db: Session = Depends(get_db)):
    inv = db.scalar(select(Invitation).where(Invitation.token_hash == hash_token(body.token)))
    if inv is None or inv.accepted_at is not None or inv.expires_at < datetime.now(timezone.utc):
        raise HTTPException(400, "Invitación inválida o expirada")
    if db.scalar(select(Profile).where(func.lower(Profile.email) == inv.email.lower())):
        raise HTTPException(409, "Ya existe un usuario con ese correo")
    u = Profile(email=inv.email, full_name=body.full_name, role=inv.role, password_hash=hash_password(body.password))
    db.add(u)
    inv.accepted_at = datetime.now(timezone.utc)
    db.flush()
    audit(db, "auth.accept_invitation", "profile", u.id, u.id, ip=client_ip(request))
    db.commit()
    token, exp = create_access_token(str(u.id), u.role)
    return TokenOut(access_token=token, expires_in=exp, user=user_dict(u))
