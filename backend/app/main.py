from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.api.routes import admin, auth, draws, evaluations, games, imports, predictions, stats
from app.config import get_settings
from app.db import get_engine
from app.engine.numbers import ALGORITHM_VERSION_NUMBERS as ALGORITHM_VERSION

logging.basicConfig(level=logging.INFO)


def create_app() -> FastAPI:
    s = get_settings()
    app = FastAPI(
        title="Analítica de Sorteos — API",
        version=ALGORITHM_VERSION,
        description="Plataforma de análisis estadístico y evaluación predictiva de sorteos. "
        "El motor estadístico es la fuente de verdad; ninguna funcionalidad depende de servicios de IA.",
        docs_url="/api/docs", openapi_url="/api/openapi.json", redoc_url=None,
    )
    app.add_middleware(CORSMiddleware, allow_origins=s.cors_origin_list, allow_credentials=True,
                       allow_methods=["*"], allow_headers=["*"])
    for r in (auth, games, draws, imports, stats, predictions, evaluations, admin):
        app.include_router(r.router, prefix="/api")

    @app.get("/api/health", tags=["Sistema"])
    def health():
        with get_engine().connect() as c:
            c.execute(text("SELECT 1"))
        return {"status": "ok", "algorithm_version": ALGORITHM_VERSION}

    return app


app = create_app()
