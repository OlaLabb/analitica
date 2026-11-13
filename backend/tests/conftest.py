"""Configuración de pruebas.

Usa SIEMPRE una base de datos separada (sorteo_test). Los datos de las pruebas son SINTÉTICOS,
generados con semilla fija, y nunca se mezclan con el histórico real.
"""
from __future__ import annotations

import os

os.environ["ENVIRONMENT"] = "test"
os.environ["DATABASE_URL"] = os.environ.get(
    "TEST_DATABASE_URL", "postgresql+psycopg://sorteo:sorteo@localhost:5432/sorteo_test")
os.environ["AUTO_PUBLISH_ON_NEW_DATA"] = "false"
os.environ["JWT_SECRET"] = "test-secret-0123456789abcdef0123456789abcdef"
assert "test" in os.environ["DATABASE_URL"], "Las pruebas solo pueden correr contra una base *_test"

import pytest  # noqa: E402
from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.config import get_settings  # noqa: E402
from app.db import SessionLocal, get_engine, reset_engine  # noqa: E402
from tests.synthetic import (  # noqa: E402,F401
    SYNTHETIC_PRIZES, SYNTHETIC_RULES, make_synthetic_rows, synthetic_frame,
)

get_settings.cache_clear()
reset_engine()

BACKEND = os.path.dirname(os.path.dirname(__file__))


@pytest.fixture(scope="session", autouse=True)
def _schema():
    eng = get_engine()
    with eng.begin() as c:
        c.execute(text("DROP SCHEMA public CASCADE; CREATE SCHEMA public;"))
    cfg = Config(os.path.join(BACKEND, "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(BACKEND, "alembic"))
    command.upgrade(cfg, "head")
    yield


TABLES = ["prediction_evaluations", "prediction_candidates", "predictions", "prediction_runs", "backtest_runs",
          "statistical_snapshots", "draws", "historical_versions", "historical_imports", "model_configurations",
          "model_versions", "game_rules", "processing_jobs", "audit_logs", "invitations", "games", "profiles"]


@pytest.fixture()
def db():
    with get_engine().begin() as c:
        c.execute(text("TRUNCATE " + ", ".join(TABLES) + " RESTART IDENTITY CASCADE"))
    s = SessionLocal()
    yield s
    s.rollback()
    s.close()


@pytest.fixture()
def game(db):
    """Juego SINTÉTICO de prueba con reglas confirmadas (no representa un juego real)."""
    from app.models import Game, GameRules

    g = Game(code="TEST", name="Juego sintético de prueba")
    db.add(g)
    db.flush()
    db.add(GameRules(game_id=g.id, version_number=1, name="Reglas sintéticas", is_active=True,
                     prize_categories=SYNTHETIC_PRIZES, **SYNTHETIC_RULES))
    db.commit()
    return g


@pytest.fixture()
def admin(db):
    from app.core.security import hash_password
    from app.models import Profile

    u = Profile(email="admin@test.example", full_name="Admin prueba", role="admin",
                password_hash=hash_password("admin-password-123"))
    db.add(u)
    db.commit()
    return u


@pytest.fixture()
def user(db):
    from app.core.security import hash_password
    from app.models import Profile

    u = Profile(email="user@test.example", full_name="Usuario prueba", role="user",
                password_hash=hash_password("user-password-123"))
    db.add(u)
    db.commit()
    return u


@pytest.fixture()
def client():
    from fastapi.testclient import TestClient

    from app.main import create_app

    return TestClient(create_app())


def login(client, email, password):
    r = client.post("/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}
