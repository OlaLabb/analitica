"""Configuración central leída de variables de entorno (ver .env.example)."""
from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(".env", "../.env"), env_file_encoding="utf-8", extra="ignore")

    environment: Literal["development", "test", "production"] = "development"
    database_url: str = "postgresql+psycopg://sorteo:sorteo@localhost:5432/sorteo"

    # Autenticación
    auth_provider: Literal["local", "supabase"] = "local"
    jwt_secret: str = Field(default="change-me-in-development-only-0123456789abcdef", min_length=32)
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 60 * 12
    supabase_url: str | None = None
    supabase_jwt_secret: str | None = None
    supabase_jwt_audience: str = "authenticated"

    # CORS
    cors_origins: str = "http://localhost:5173"

    # Procesamiento
    auto_publish_on_new_data: bool = True
    max_upload_mb: int = 20

    # Búsqueda automática de resultados en la fuente web oficial
    fetch_enabled: bool = True
    fetch_interval_minutes: int = Field(default=120, ge=10)
    auto_commit_fetched: bool = False  # False = los resultados quedan pendientes de confirmación
    fetch_user_agent: str = "AnaliticaSorteo/1.0 (consulta de resultados publicos)"
    fetch_delay_seconds: float = 1.0

    # IA opcional (fase futura). 'none' = desactivada; ninguna funcionalidad depende de ella.
    assistant_provider: Literal["none"] = "none"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    if s.environment == "production" and s.jwt_secret.startswith("change-me"):
        raise RuntimeError("JWT_SECRET debe configurarse en producción")
    return s
