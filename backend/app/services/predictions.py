"""Predicciones oficiales centralizadas (una por juego y fecha objetivo) y experimentos.

Formato vigente ``numbers_v1``: 5 números en cualquier orden + Súper Número, que es como se juega y se
paga Baloto. Las predicciones antiguas por posición (formato 1.x) se conservan intactas (inmutables).

Garantías:
- Bloqueo asesor por juego: dos procesos no pueden publicar a la vez.
- Idempotencia: misma entrada (contenido del histórico, reglas, configuración, algoritmo, fecha)
  ⇒ se devuelve la predicción existente.
- Publicación atómica: la anterior pasa a 'superseded' y la nueva a 'published' en la misma
  transacción; si algo falla, el rollback deja visible la anterior.
- Inmutabilidad: triggers en PostgreSQL impiden alterar predicciones publicadas.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone

import numpy as np
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import LOCK_OFFICIAL, advisory_xact_lock
from app.engine import MAIN_VARIABLES, VARIABLES
from app.engine.config import sha256_json
from app.engine.data import select_window
from app.engine.numbers import (
    ALGORITHM_VERSION_NUMBERS, FORMAT, MODEL_DESCRIPTIONS, NumbersConfig, config_hash, default_numbers_config,
    predict_numbers,
)
from app.engine.odds import classify
from app.models import (
    Draw, Game, ModelConfiguration, ModelVersion, Prediction, PredictionCandidate, PredictionEvaluation,
    PredictionRun,
)
from app.services import history
from app.services.audit import audit


# ------------------------------------------------------------------ versiones y configuración
def ensure_model_version(db: Session) -> ModelVersion:
    mv = db.scalar(select(ModelVersion).where(ModelVersion.algorithm_version == ALGORITHM_VERSION_NUMBERS))
    if mv is None:
        mv = ModelVersion(algorithm_version=ALGORITHM_VERSION_NUMBERS,
                          description="Predicción por números en cualquier orden + Súper Número",
                          models=[{"type": k, "description": v} for k, v in MODEL_DESCRIPTIONS.items()])
        db.add(mv)
        db.flush()
    return mv


def active_config(db: Session, game: Game, actor: uuid.UUID | None = None) -> ModelConfiguration:
    """Configuración activa del juego. Si la activa es de un formato anterior, se crea (y activa) una
    nueva versión por defecto del formato vigente; las anteriores se conservan."""
    cfg = db.scalar(select(ModelConfiguration).where(ModelConfiguration.game_id == game.id,
                                                     ModelConfiguration.is_active.is_(True)))
    if cfg is not None and cfg.params.get("format") == FORMAT:
        return cfg
    c = default_numbers_config()
    return create_config(db, game, "Configuración por defecto (números en cualquier orden)", c.model_dump(mode="json"),
                         actor, activate=True, notes="Creada automáticamente al adoptar el formato numbers_v1")


def create_config(db: Session, game: Game, name: str, params: dict, actor: uuid.UUID | None, activate: bool,
                  notes: str | None = None) -> ModelConfiguration:
    c = NumbersConfig(**params)  # valida
    last = db.scalar(select(ModelConfiguration.version_number).where(ModelConfiguration.game_id == game.id)
                     .order_by(ModelConfiguration.version_number.desc()).limit(1)) or 0
    if activate:
        for old in db.scalars(select(ModelConfiguration).where(ModelConfiguration.game_id == game.id,
                                                               ModelConfiguration.is_active.is_(True))):
            old.is_active = False
        db.flush()
    cfg = ModelConfiguration(game_id=game.id, version_number=last + 1, name=name, params=c.model_dump(mode="json"),
                             config_hash=config_hash(c), is_active=activate, notes=notes, created_by=actor)
    db.add(cfg)
    db.flush()
    audit(db, "config.create", "model_configuration", cfg.id, actor,
          after={"game": game.code, "version": cfg.version_number, "active": activate})
    return cfg


# ------------------------------------------------------------------ fechas objetivo
def next_draw_date(game_rules_weekdays: list[int] | None, last: date | None, today: date | None = None) -> date:
    if not game_rules_weekdays:
        raise ValueError("Configure los días de sorteo en las reglas del juego para calcular la próxima fecha")
    start = last or (today or date.today())
    d = start + timedelta(days=1)
    for _ in range(14):
        if d.weekday() in game_rules_weekdays:
            return d
        d += timedelta(days=1)
    raise ValueError("No se encontró próxima fecha de sorteo")


# ------------------------------------------------------------------ cómputo
def _compute(db: Session, game: Game, target_date: date, cfg_row: ModelConfiguration, version_number: int):
    rules_row = history.active_rules_row(db, game)
    rules = history.to_engine_rules(rules_row)
    cfg = NumbersConfig(**cfg_row.params)
    full = history.load_frame(db, game, version_number)
    prior = full[full["draw_date"] < np.datetime64(target_date)].reset_index(drop=True)
    win = select_window(prior, cfg.data_scope)
    scope = {**win.describe(), "historical_version": version_number}
    result = predict_numbers(win.frame, rules, cfg, target_date, rules_row.prize_categories if rules_row else None,
                             scope, seed_key=game.code)
    return result, rules_row, cfg, scope


def compute_input_hash(db: Session, game: Game, target_date: date, cfg_row: ModelConfiguration,
                       hv_content_hash: str) -> str:
    rules_row = history.active_rules_row(db, game)
    return sha256_json({
        "game": game.code, "history": hv_content_hash, "rules": history.to_engine_rules(rules_row).to_dict(),
        "prizes": rules_row.prize_categories if rules_row else None,
        "config": cfg_row.config_hash, "algorithm": ALGORITHM_VERSION_NUMBERS, "target": target_date.isoformat(),
    })


def publish_official(db: Session, game: Game, actor: uuid.UUID | None, target_date: date | None = None,
                     ip: str | None = None) -> tuple[Prediction, bool]:
    """Devuelve (predicción, creada). Debe llamarse dentro de una transacción que el llamador confirma."""
    advisory_xact_lock(db, f"{LOCK_OFFICIAL}:{game.id}")
    hv = history.current_version(db, game)
    if hv is None or hv.draw_count == 0:
        raise ValueError("No hay histórico cargado para este juego")
    rules_row = history.active_rules_row(db, game)
    if target_date is None:
        target_date = next_draw_date(rules_row.draw_weekdays if rules_row else None, hv.last_draw_date)
    cfg_row = active_config(db, game, actor)
    mv = ensure_model_version(db)
    ih = compute_input_hash(db, game, target_date, cfg_row, hv.content_hash)
    existing = db.scalar(select(Prediction).where(Prediction.game_id == game.id, Prediction.kind == "official",
                                                  Prediction.target_date == target_date, Prediction.input_hash == ih))
    if existing is not None:
        if existing.status == "superseded":
            raise ValueError("Esta entrada ya produjo una predicción que fue reemplazada; revise el histórico")
        return existing, False
    run = PredictionRun(game_id=game.id, kind="official", status="running", target_date=target_date,
                        historical_version_id=hv.id, model_version_id=mv.id, configuration_id=cfg_row.id,
                        game_rules_id=rules_row.id if rules_row else None, input_hash=ih, triggered_by=actor)
    db.add(run)
    db.flush()
    result, _, cfg, scope = _compute(db, game, target_date, cfg_row, hv.version_number)
    now = datetime.now(timezone.utc)
    pred = _store_prediction(db, game, run, result, "official", "draft", target_date, hv.id, mv.id, cfg_row.id,
                             rules_row.id if rules_row else None, cfg, scope, ih, actor, now)
    prev = db.scalar(select(Prediction).where(Prediction.game_id == game.id, Prediction.kind == "official",
                                              Prediction.target_date == target_date, Prediction.status == "published"))
    if prev is not None:
        prev.status = "superseded"
        prev.superseded_at = now
        prev.superseded_by_id = pred.id
        db.flush()
    pred.status = "published"
    pred.published_at = now
    run.status = "completed"
    run.finished_at = now
    run.data_scope = scope
    db.flush()
    audit(db, "prediction.publish", "prediction", pred.id, actor, ip=ip,
          after={"game": game.code, "target_date": target_date.isoformat(), "hash": pred.prediction_hash,
                 "historical_version": hv.version_number, "superseded": str(prev.id) if prev else None})
    return pred, True


def run_experiment(db: Session, game: Game, actor: uuid.UUID, params: dict, target_date: date | None = None) -> Prediction:
    """Experimento personal: NUNCA altera la predicción oficial (kind='experimental')."""
    hv = history.current_version(db, game)
    if hv is None:
        raise ValueError("No hay histórico cargado")
    rules_row = history.active_rules_row(db, game)
    if target_date is None:
        target_date = next_draw_date(rules_row.draw_weekdays if rules_row else None, hv.last_draw_date)
    cfg_row = create_config(db, game, f"Experimento {datetime.now(timezone.utc):%Y-%m-%d %H:%M}", params, actor,
                            activate=False, notes="experimental")
    mv = ensure_model_version(db)
    run = PredictionRun(game_id=game.id, kind="experimental", status="running", target_date=target_date,
                        historical_version_id=hv.id, model_version_id=mv.id, configuration_id=cfg_row.id,
                        game_rules_id=rules_row.id if rules_row else None, triggered_by=actor)
    db.add(run)
    db.flush()
    result, _, cfg, scope = _compute(db, game, target_date, cfg_row, hv.version_number)
    ih = compute_input_hash(db, game, target_date, cfg_row, hv.content_hash)
    now = datetime.now(timezone.utc)
    pred = _store_prediction(db, game, run, result, "experimental", "experimental", target_date, hv.id, mv.id,
                             cfg_row.id, run.game_rules_id, cfg, scope, ih, actor, now)
    run.status, run.finished_at, run.input_hash, run.data_scope = "completed", now, ih, scope
    return pred


def _store_prediction(db, game, run, result, kind, status, target_date, hv_id, mv_id, cfg_id, rules_id, cfg,
                      scope, ih, actor, now) -> Prediction:
    pred = Prediction(
        game_id=game.id, run_id=run.id, kind=kind, status=status, target_date=target_date,
        target_weekday=target_date.weekday(), historical_version_id=hv_id, model_version_id=mv_id,
        configuration_id=cfg_id, game_rules_id=rules_id, algorithm_version=result["algorithm_version"],
        official_model=result["official_model"], params=cfg.model_dump(mode="json"), data_scope=scope,
        combinations={"suggested": result["suggested"], "odds": result["odds"]},
        support_metrics={"format": FORMAT, "main_reference": result["main"]["reference"],
                         "super_reference": result["super"]["reference"], "disclaimer": result["disclaimer"],
                         "official_model_description": result["official_model_description"]},
        warnings=result["warnings"], input_hash=ih, prediction_hash=result["prediction_hash"], generated_at=now,
        created_by=actor,
    )
    db.add(pred)
    db.flush()
    for var, block in (("main", result["main"]), ("sn", result["super"])):
        for c in block["candidates"]:
            db.add(PredictionCandidate(
                prediction_id=pred.id, variable=var, rank=c["rank"], number=c["number"], score=c["score"],
                baseline_prob=c["reference"], lift=c["lift"], uncertainty=c["uncertainty"],
                factors={"models": c["model_scores"], "explanation": c["explanation"]}, metrics=c["metrics"],
            ))
    db.flush()
    return pred


# ------------------------------------------------------------------ evaluación en vivo
def evaluate_pending(db: Session, game: Game) -> int:
    """Compara predicciones oficiales con el resultado real cuando ya existe el sorteo."""
    preds = db.scalars(select(Prediction).where(
        Prediction.game_id == game.id, Prediction.kind == "official",
        Prediction.status.in_(("published", "superseded")),
        ~select(PredictionEvaluation.id).where(PredictionEvaluation.prediction_id == Prediction.id,
                                               PredictionEvaluation.kind == "live").exists()))
    rules_row = history.active_rules_row(db, game)
    n = 0
    for p in preds:
        draw = db.scalar(select(Draw).where(Draw.game_id == game.id, Draw.draw_date == p.target_date,
                                            Draw.valid_to_version.is_(None)))
        if draw is None:
            continue
        db.add(PredictionEvaluation(kind="live", prediction_id=p.id, model_name=p.official_model, draw_id=draw.id,
                                    target_date=p.target_date,
                                    results=evaluate_prediction(p, draw, rules_row.prize_categories if rules_row else None)))
        n += 1
    db.flush()
    return n


def evaluate_prediction(p: Prediction, draw: Draw, prize_categories: list[dict] | None = None) -> dict:
    actual_main = [draw.position_1, draw.position_2, draw.position_3, draw.position_4, draw.position_5]
    if (p.support_metrics or {}).get("format") == FORMAT:
        sug = (p.combinations or {}).get("suggested", {})
        k = len(set(sug.get("numbers", [])) & set(actual_main))
        hit = sug.get("super_number") == draw.super_number
        top = [c.number for c in sorted(p.candidates, key=lambda c: c.rank) if c.variable == "main"]
        return {
            "format": FORMAT, "actual": {"numbers": actual_main, "super_number": draw.super_number},
            "suggested": sug, "matches": k, "super_hit": hit,
            "category": classify(k, hit, prize_categories),
            "top_list_hits": sorted(set(top) & set(actual_main)), "top_list_size": len(top),
        }
    # formato anterior (por posición), conservado para predicciones históricas
    actual = dict(zip(VARIABLES, [*actual_main, draw.super_number]))
    out = {"format": "positional_v1", "actual": actual, "variables": {}}
    for var in VARIABLES:
        cands = sorted([c for c in p.candidates if c.variable == var], key=lambda c: c.rank)
        rank = next((c.rank for c in cands if c.number == actual[var]), None)
        out["variables"][var] = {"actual": actual[var], "rank_in_top": rank, "top_k": len(cands)}
    out["combinations"] = [{"numbers": c["numbers"], "number_matches": len(set(c["numbers"]) & set(actual_main))}
                           for c in (p.combinations or {}).get("items", [])]
    return out
