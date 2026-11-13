"""Dependencias FastAPI: sesión de BD, usuario actual y control de roles (siempre en el backend)."""
from __future__ import annotations

import uuid

import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.core.security import decode_local_token, decode_supabase_token
from app.db import get_db
from app.models import Game, Profile

bearer = HTTPBearer(auto_error=False)


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer), db: Session = Depends(get_db)
) -> Profile:
    if creds is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Autenticación requerida")
    settings = get_settings()
    try:
        if settings.auth_provider == "supabase":
            claims = decode_supabase_token(creds.credentials)
            user = db.scalar(select(Profile).where(Profile.external_subject == claims["sub"]))
        else:
            claims = decode_local_token(creds.credentials)
            user = db.get(Profile, uuid.UUID(claims["sub"]))
    except (jwt.PyJWTError, KeyError, ValueError):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token inválido o expirado")
    if user is None or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Usuario inexistente o inactivo")
    return user


def require_admin(user: Profile = Depends(get_current_user)) -> Profile:
    if user.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Se requiere rol administrador")
    return user


def get_game(game_code: str, db: Session = Depends(get_db)) -> Game:
    game = db.scalar(select(Game).where(Game.code == game_code.upper()))
    if game is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Juego '{game_code}' no existe")
    return game


def client_ip(request: Request) -> str | None:
    return request.client.host if request.client else None
