from __future__ import annotations

import hashlib
from collections.abc import Iterator

from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import get_settings


class Base(DeclarativeBase):
    pass


_engine = None
_SessionLocal: sessionmaker | None = None


def get_engine():
    global _engine, _SessionLocal
    if _engine is None:
        _engine = create_engine(get_settings().database_url, pool_pre_ping=True, future=True)
        _SessionLocal = sessionmaker(bind=_engine, expire_on_commit=False, autoflush=False)
    return _engine


def reset_engine() -> None:
    """Usado en pruebas para reconectar con otra DATABASE_URL."""
    global _engine, _SessionLocal
    if _engine is not None:
        _engine.dispose()
    _engine = None
    _SessionLocal = None


def SessionLocal() -> Session:  # noqa: N802 - API tipo fábrica
    get_engine()
    assert _SessionLocal is not None
    return _SessionLocal()


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _lock_key(name: str) -> int:
    # Clave de 63 bits estable derivada del nombre del bloqueo
    return int.from_bytes(hashlib.sha256(name.encode()).digest()[:8], "big") & 0x7FFF_FFFF_FFFF_FFFF


def advisory_xact_lock(db: Session, name: str) -> None:
    """Bloqueo asesor de PostgreSQL liberado automáticamente al terminar la transacción."""
    db.execute(text("SELECT pg_advisory_xact_lock(:k)"), {"k": _lock_key(name)})


def try_advisory_xact_lock(db: Session, name: str) -> bool:
    return bool(db.execute(text("SELECT pg_try_advisory_xact_lock(:k)"), {"k": _lock_key(name)}).scalar())


LOCK_HISTORY = "history_write"
LOCK_OFFICIAL = "official_prediction"
