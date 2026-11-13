"""Modelos SQLAlchemy. Ver docs/DATABASE.md para el diseño completo."""
from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base

VARIABLES = ("p1", "p2", "p3", "p4", "p5", "sn")


def _uuid() -> uuid.UUID:
    return uuid.uuid4()


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# ---------------------------------------------------------------- usuarios
class Profile(TimestampMixin, Base):
    __tablename__ = "profiles"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    full_name: Mapped[str | None] = mapped_column(String(200))
    role: Mapped[str] = mapped_column(String(16), nullable=False, default="user")
    password_hash: Mapped[str | None] = mapped_column(String(200))
    auth_provider: Mapped[str] = mapped_column(String(16), nullable=False, default="local")
    external_subject: Mapped[str | None] = mapped_column(String(200), unique=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        CheckConstraint("role IN ('admin','user')", name="ck_profiles_role"),
        Index("ux_profiles_email_lower", func.lower(email), unique=True),
    )


class Invitation(TimestampMixin, Base):
    __tablename__ = "invitations"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    role: Mapped[str] = mapped_column(String(16), nullable=False, default="user")
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("profiles.id"))


# ---------------------------------------------------------------- juegos
class Game(TimestampMixin, Base):
    """Tipo de sorteo (p. ej. BALOTO, REVANCHA). Cada juego tiene histórico, reglas,
    estadísticas y predicciones independientes; el motor siempre opera sobre un solo juego."""

    __tablename__ = "games"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(32), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # Fuente web oficial de resultados; '{n}' se reemplaza por el número de sorteo. NULL = sin fuente.
    results_url_template: Mapped[str | None] = mapped_column(String(300))

    __table_args__ = (CheckConstraint("code ~ '^[A-Z0-9_]{2,32}$'", name="ck_games_code"),)


def _game_fk() -> Mapped[int]:
    return mapped_column(ForeignKey("games.id"), nullable=False)


# ---------------------------------------------------------------- reglas del juego
class GameRules(TimestampMixin, Base):
    """Reglas versionadas. NULL = dato no confirmado por el administrador."""

    __tablename__ = "game_rules"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    game_id: Mapped[int] = _game_fk()
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    main_min: Mapped[int | None] = mapped_column(Integer)
    main_max: Mapped[int | None] = mapped_column(Integer)
    super_min: Mapped[int | None] = mapped_column(Integer)
    super_max: Mapped[int | None] = mapped_column(Integer)
    main_unique: Mapped[bool | None] = mapped_column(Boolean)  # ¿números principales sin repetición?
    main_order: Mapped[str] = mapped_column(String(16), nullable=False, default="unknown")
    draw_weekdays: Mapped[list | None] = mapped_column(JSONB)  # 0=lunes … 6=domingo
    # Categorías de premio tal como las publica la fuente oficial: [{"matches": 4, "super": true, "label": "4 + SB"}]
    prize_categories: Mapped[list | None] = mapped_column(JSONB)
    prize_source: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    notes: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("profiles.id"))

    __table_args__ = (
        CheckConstraint("main_order IN ('sorted_asc','draw_order','unknown')", name="ck_rules_order"),
        CheckConstraint("main_min IS NULL OR main_max IS NULL OR main_min <= main_max", name="ck_rules_main"),
        CheckConstraint("super_min IS NULL OR super_max IS NULL OR super_min <= super_max", name="ck_rules_super"),
        UniqueConstraint("game_id", "version_number", name="ux_rules_game_version"),
        Index("ux_game_rules_active", "game_id", unique=True, postgresql_where=text("is_active")),
    )


# ---------------------------------------------------------------- histórico
class HistoricalImport(TimestampMixin, Base):
    __tablename__ = "historical_imports"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    filename: Mapped[str] = mapped_column(String(300), nullable=False)
    file_format: Mapped[str] = mapped_column(String(8), nullable=False)
    file_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    file_size: Mapped[int] = mapped_column(Integer, nullable=False)
    file_content: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    sheet_name: Mapped[str | None] = mapped_column(String(200))
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="uploaded")
    column_mapping: Mapped[dict | None] = mapped_column(JSONB)
    options: Mapped[dict | None] = mapped_column(JSONB)
    rows_detected: Mapped[int | None] = mapped_column(Integer)
    rows_valid: Mapped[int | None] = mapped_column(Integer)
    rows_rejected: Mapped[int | None] = mapped_column(Integer)
    rows_duplicate_existing: Mapped[int | None] = mapped_column(Integer)
    rows_conflicting_existing: Mapped[int | None] = mapped_column(Integer)
    rows_inserted: Mapped[int | None] = mapped_column(Integer)
    errors: Mapped[list | None] = mapped_column(JSONB)
    report: Mapped[dict | None] = mapped_column(JSONB)
    resulting_version_id: Mapped[int | None] = mapped_column(ForeignKey("historical_versions.id"))
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("profiles.id"))
    committed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        CheckConstraint("status IN ('uploaded','validated','committed','failed','cancelled')", name="ck_import_status"),
    )


class HistoricalVersion(TimestampMixin, Base):
    __tablename__ = "historical_versions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    game_id: Mapped[int] = _game_fk()
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    parent_version_number: Mapped[int | None] = mapped_column(Integer)
    change_type: Mapped[str] = mapped_column(String(16), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    draw_count: Mapped[int] = mapped_column(Integer, nullable=False)
    first_draw_date: Mapped[date | None] = mapped_column(Date)
    last_draw_date: Mapped[date | None] = mapped_column(Date)
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    is_append_only: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    import_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("profiles.id"))

    __table_args__ = (
        CheckConstraint("change_type IN ('empty','import','manual_add','correction','delete')", name="ck_hv_change"),
        UniqueConstraint("game_id", "version_number", name="ux_hv_game_version"),
    )


class Draw(TimestampMixin, Base):
    """Fila inmutable de sorteo. Una corrección cierra la fila (valid_to_version) y crea otra."""

    __tablename__ = "draws"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    game_id: Mapped[int] = _game_fk()
    draw_date: Mapped[date] = mapped_column(Date, nullable=False)
    weekday: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    draw_number: Mapped[int | None] = mapped_column(Integer)  # identificador externo, si el archivo lo trae
    position_1: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    position_2: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    position_3: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    position_4: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    position_5: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    super_number: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    valid_from_version: Mapped[int] = mapped_column(Integer, nullable=False)
    valid_to_version: Mapped[int | None] = mapped_column(Integer)
    source_import_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("historical_imports.id"))
    supersedes_id: Mapped[int | None] = mapped_column(ForeignKey("draws.id"))
    change_reason: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("profiles.id"))

    __table_args__ = (
        CheckConstraint("weekday BETWEEN 0 AND 6", name="ck_draws_weekday"),
        CheckConstraint("valid_to_version IS NULL OR valid_to_version > valid_from_version", name="ck_draws_validity"),
        Index("ux_draws_current_date", "game_id", "draw_date", unique=True,
              postgresql_where=text("valid_to_version IS NULL")),
        Index("ux_draws_current_number", "game_id", "draw_number", unique=True,
              postgresql_where=text("valid_to_version IS NULL AND draw_number IS NOT NULL")),
        Index("ix_draws_validity", "game_id", "valid_from_version", "valid_to_version"),
        Index("ix_draws_date", "game_id", "draw_date"),
    )

    @property
    def numbers(self) -> list[int]:
        return [self.position_1, self.position_2, self.position_3, self.position_4, self.position_5]


# ---------------------------------------------------------------- modelos y configuración
class ModelVersion(TimestampMixin, Base):
    __tablename__ = "model_versions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    algorithm_version: Mapped[str] = mapped_column(String(32), nullable=False, unique=True)
    description: Mapped[str | None] = mapped_column(Text)
    models: Mapped[list] = mapped_column(JSONB, nullable=False)


class ModelConfiguration(TimestampMixin, Base):
    __tablename__ = "model_configurations"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    game_id: Mapped[int] = _game_fk()
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    params: Mapped[dict] = mapped_column(JSONB, nullable=False)
    config_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    notes: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("profiles.id"))

    __table_args__ = (
        UniqueConstraint("game_id", "version_number", name="ux_cfg_game_version"),
        Index("ux_model_cfg_active", "game_id", unique=True, postgresql_where=text("is_active")),
    )


# ---------------------------------------------------------------- predicciones
class PredictionRun(TimestampMixin, Base):
    __tablename__ = "prediction_runs"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    game_id: Mapped[int] = _game_fk()
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="running")
    target_date: Mapped[date | None] = mapped_column(Date)
    historical_version_id: Mapped[int] = mapped_column(ForeignKey("historical_versions.id"), nullable=False)
    model_version_id: Mapped[int] = mapped_column(ForeignKey("model_versions.id"), nullable=False)
    configuration_id: Mapped[int] = mapped_column(ForeignKey("model_configurations.id"), nullable=False)
    game_rules_id: Mapped[int | None] = mapped_column(ForeignKey("game_rules.id"))
    input_hash: Mapped[str | None] = mapped_column(String(64))
    data_scope: Mapped[dict | None] = mapped_column(JSONB)
    seed: Mapped[int | None] = mapped_column(BigInteger)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    error: Mapped[str | None] = mapped_column(Text)
    triggered_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("profiles.id"))

    __table_args__ = (
        CheckConstraint("kind IN ('official','experimental')", name="ck_run_kind"),
        CheckConstraint("status IN ('running','completed','failed','reused')", name="ck_run_status"),
    )


class Prediction(TimestampMixin, Base):
    __tablename__ = "predictions"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    game_id: Mapped[int] = _game_fk()
    run_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("prediction_runs.id"), nullable=False, unique=True)
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="draft")
    target_date: Mapped[date] = mapped_column(Date, nullable=False)
    target_weekday: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    historical_version_id: Mapped[int] = mapped_column(ForeignKey("historical_versions.id"), nullable=False)
    model_version_id: Mapped[int] = mapped_column(ForeignKey("model_versions.id"), nullable=False)
    configuration_id: Mapped[int] = mapped_column(ForeignKey("model_configurations.id"), nullable=False)
    game_rules_id: Mapped[int | None] = mapped_column(ForeignKey("game_rules.id"))
    algorithm_version: Mapped[str] = mapped_column(String(32), nullable=False)
    official_model: Mapped[str] = mapped_column(String(48), nullable=False)
    params: Mapped[dict] = mapped_column(JSONB, nullable=False)
    data_scope: Mapped[dict] = mapped_column(JSONB, nullable=False)
    combinations: Mapped[dict | None] = mapped_column(JSONB)
    support_metrics: Mapped[dict] = mapped_column(JSONB, nullable=False)
    warnings: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    input_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    prediction_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    superseded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    superseded_by_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("predictions.id"))
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("profiles.id"))

    candidates: Mapped[list["PredictionCandidate"]] = relationship(
        back_populates="prediction", order_by="(PredictionCandidate.variable, PredictionCandidate.rank)"
    )

    __table_args__ = (
        CheckConstraint("kind IN ('official','experimental')", name="ck_pred_kind"),
        CheckConstraint("status IN ('draft','published','superseded','experimental')", name="ck_pred_status"),
        Index(
            "ux_pred_official_published",
            "game_id",
            "target_date",
            unique=True,
            postgresql_where=text("kind = 'official' AND status = 'published'"),
        ),
        Index(
            "ux_pred_official_input",
            "game_id",
            "target_date",
            "input_hash",
            unique=True,
            postgresql_where=text("kind = 'official'"),
        ),
        Index("ix_pred_target", "game_id", "target_date"),
    )


class PredictionCandidate(Base):
    __tablename__ = "prediction_candidates"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    prediction_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("predictions.id"), nullable=False)
    variable: Mapped[str] = mapped_column(String(4), nullable=False)
    rank: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    number: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    score: Mapped[float] = mapped_column(Float, nullable=False)
    baseline_prob: Mapped[float | None] = mapped_column(Float)
    lift: Mapped[float | None] = mapped_column(Float)
    uncertainty: Mapped[dict] = mapped_column(JSONB, nullable=False)
    factors: Mapped[dict] = mapped_column(JSONB, nullable=False)
    metrics: Mapped[dict] = mapped_column(JSONB, nullable=False)

    prediction: Mapped[Prediction] = relationship(back_populates="candidates")

    __table_args__ = (
        CheckConstraint("variable IN ('p1','p2','p3','p4','p5','sn','main')", name="ck_cand_var"),
        UniqueConstraint("prediction_id", "variable", "rank", name="ux_cand_rank"),
        UniqueConstraint("prediction_id", "variable", "number", name="ux_cand_number"),
    )


# ---------------------------------------------------------------- evaluación
class BacktestRun(TimestampMixin, Base):
    __tablename__ = "backtest_runs"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    game_id: Mapped[int] = _game_fk()
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="running")
    historical_version_id: Mapped[int] = mapped_column(ForeignKey("historical_versions.id"), nullable=False)
    model_version_id: Mapped[int] = mapped_column(ForeignKey("model_versions.id"), nullable=False)
    configuration_id: Mapped[int] = mapped_column(ForeignKey("model_configurations.id"), nullable=False)
    game_rules_id: Mapped[int | None] = mapped_column(ForeignKey("game_rules.id"))
    params: Mapped[dict] = mapped_column(JSONB, nullable=False)
    seed: Mapped[int] = mapped_column(BigInteger, nullable=False)
    summary: Mapped[dict | None] = mapped_column(JSONB)
    error: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("profiles.id"))

    __table_args__ = (CheckConstraint("status IN ('running','completed','failed')", name="ck_bt_status"),)


class PredictionEvaluation(TimestampMixin, Base):
    __tablename__ = "prediction_evaluations"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    prediction_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("predictions.id"))
    backtest_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("backtest_runs.id"))
    model_name: Mapped[str] = mapped_column(String(48), nullable=False)
    draw_id: Mapped[int] = mapped_column(ForeignKey("draws.id"), nullable=False)
    target_date: Mapped[date] = mapped_column(Date, nullable=False)
    results: Mapped[dict] = mapped_column(JSONB, nullable=False)

    __table_args__ = (
        CheckConstraint("kind IN ('live','backtest')", name="ck_eval_kind"),
        CheckConstraint(
            "(kind = 'live' AND prediction_id IS NOT NULL) OR (kind = 'backtest' AND backtest_id IS NOT NULL)",
            name="ck_eval_ref",
        ),
        Index("ux_eval_live", "prediction_id", unique=True, postgresql_where=text("kind = 'live'")),
        Index("ix_eval_backtest", "backtest_id", "model_name"),
    )


class StatisticalSnapshot(TimestampMixin, Base):
    __tablename__ = "statistical_snapshots"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    game_id: Mapped[int] = _game_fk()
    historical_version_id: Mapped[int] = mapped_column(ForeignKey("historical_versions.id"), nullable=False)
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    computation: Mapped[str] = mapped_column(String(16), nullable=False)
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False)
    payload_hash: Mapped[str] = mapped_column(String(64), nullable=False)

    __table_args__ = (
        UniqueConstraint("historical_version_id", "kind", name="ux_snapshot_version_kind"),
        CheckConstraint("computation IN ('incremental','full')", name="ck_snapshot_comp"),
    )


# ---------------------------------------------------------------- operación
class ProcessingJob(TimestampMixin, Base):
    __tablename__ = "processing_jobs"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    job_type: Mapped[str] = mapped_column(String(32), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="queued")
    params: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    result: Mapped[dict | None] = mapped_column(JSONB)
    error: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("profiles.id"))
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        CheckConstraint("status IN ('queued','running','succeeded','failed')", name="ck_job_status"),
        Index("ix_jobs_created", "created_at"),
    )


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    actor_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("profiles.id"))
    action: Mapped[str] = mapped_column(String(64), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(48), nullable=False)
    entity_id: Mapped[str | None] = mapped_column(String(64))
    before: Mapped[dict | None] = mapped_column(JSONB)
    after: Mapped[dict | None] = mapped_column(JSONB)
    details: Mapped[dict | None] = mapped_column(JSONB)
    ip_address: Mapped[str | None] = mapped_column(String(64))

    __table_args__ = (Index("ix_audit_occurred", "occurred_at"), Index("ix_audit_entity", "entity_type", "entity_id"))
