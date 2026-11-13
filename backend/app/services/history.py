"""Histórico versionado por juego.

Una versión N contiene las filas de ``draws`` con valid_from_version <= N y
(valid_to_version IS NULL o valid_to_version > N). Nunca se sobrescribe una fila: una corrección
cierra la fila anterior y crea una nueva; un borrado solo la cierra.
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date

import pandas as pd
from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from app.db import LOCK_HISTORY, advisory_xact_lock
from app.engine import MAIN_VARIABLES, VARIABLES
from app.engine.config import sha256_json
from app.engine.data import make_frame
from app.engine.rules import GameRules as EngineRules
from app.engine.snapshots import SNAPSHOT_KIND, apply_draws, build_full, snapshot_hash
from app.models import Draw, Game, GameRules, HistoricalVersion, StatisticalSnapshot
from app.services.audit import audit

POS_COLS = ["position_1", "position_2", "position_3", "position_4", "position_5"]


# ------------------------------------------------------------------ reglas
def active_rules_row(db: Session, game: Game) -> GameRules | None:
    return db.scalar(select(GameRules).where(GameRules.game_id == game.id, GameRules.is_active.is_(True)))


def to_engine_rules(row: GameRules | None) -> EngineRules:
    if row is None:
        return EngineRules()
    return EngineRules(
        main_min=row.main_min, main_max=row.main_max, super_min=row.super_min, super_max=row.super_max,
        main_unique=row.main_unique, main_order=row.main_order,
        draw_weekdays=tuple(row.draw_weekdays) if row.draw_weekdays is not None else None,
    )


def validate_values(rules: EngineRules, main: list[int], sn: int) -> list[str]:
    """Valida un sorteo contra las reglas CONFIRMADAS (lo no confirmado no se valida)."""
    errors = []
    if len(main) != 5:
        errors.append("Se requieren exactamente 5 números principales")
        return errors
    if rules.main_range_known:
        for i, x in enumerate(main, 1):
            if not rules.main_min <= x <= rules.main_max:
                errors.append(f"Posición {i} = {x} fuera de rango [{rules.main_min}, {rules.main_max}]")
    if rules.super_range_known and not rules.super_min <= sn <= rules.super_max:
        errors.append(f"Súper Número = {sn} fuera de rango [{rules.super_min}, {rules.super_max}]")
    if rules.main_unique is True and len(set(main)) < 5:
        errors.append("Números principales repetidos (las reglas indican que no se repiten)")
    if rules.main_order == "sorted_asc":
        strict = rules.main_unique is not False
        if any((a >= b) if strict else (a > b) for a, b in zip(main, main[1:])):
            errors.append("Las posiciones no están en orden ascendente (las reglas indican orden ascendente)")
    return errors


# ------------------------------------------------------------------ lectura
def current_version(db: Session, game: Game) -> HistoricalVersion | None:
    return db.scalar(select(HistoricalVersion).where(HistoricalVersion.game_id == game.id)
                     .order_by(HistoricalVersion.version_number.desc()).limit(1))


def version_by_number(db: Session, game: Game, number: int) -> HistoricalVersion | None:
    return db.scalar(select(HistoricalVersion).where(HistoricalVersion.game_id == game.id,
                                                     HistoricalVersion.version_number == number))


def _valid_at(version_number: int):
    return and_(Draw.valid_from_version <= version_number,
                or_(Draw.valid_to_version.is_(None), Draw.valid_to_version > version_number))


def draws_at(db: Session, game: Game, version_number: int | None = None) -> list[Draw]:
    q = select(Draw).where(Draw.game_id == game.id)
    if version_number is None:
        q = q.where(Draw.valid_to_version.is_(None))
    else:
        q = q.where(_valid_at(version_number))
    return list(db.scalars(q.order_by(Draw.draw_date, Draw.id)))


def frame_from_draws(draws: list[Draw]) -> pd.DataFrame:
    return make_frame([{
        "draw_id": d.id, "draw_date": d.draw_date, "weekday": d.weekday,
        "p1": d.position_1, "p2": d.position_2, "p3": d.position_3, "p4": d.position_4, "p5": d.position_5,
        "sn": d.super_number, "draw_number": d.draw_number,
    } for d in draws])


def load_frame(db: Session, game: Game, version_number: int | None = None) -> pd.DataFrame:
    return frame_from_draws(draws_at(db, game, version_number))


def content_hash(draws: list[Draw]) -> str:
    """Huella del CONTENIDO (fecha, número de sorteo, valores), independiente de ids internos."""
    return sha256_json(sorted(
        [d.draw_date.isoformat(), d.draw_number, d.position_1, d.position_2, d.position_3, d.position_4,
         d.position_5, d.super_number] for d in draws))


# ------------------------------------------------------------------ escritura
@dataclass
class DrawInput:
    draw_date: date
    main: list[int]
    sn: int
    draw_number: int | None = None


def _lock(db: Session, game: Game) -> None:
    advisory_xact_lock(db, f"{LOCK_HISTORY}:{game.id}")


def _next_version_number(db: Session, game: Game) -> int:
    cur = db.scalar(select(func.max(HistoricalVersion.version_number)).where(HistoricalVersion.game_id == game.id))
    return (cur or 0) + 1


def _finalize_version(db: Session, game: Game, v: int, change_type: str, description: str,
                      actor: uuid.UUID | None, import_id=None, append_only: bool = False) -> HistoricalVersion:
    db.flush()
    draws = draws_at(db, game, v)
    hv = HistoricalVersion(
        game_id=game.id, version_number=v, parent_version_number=v - 1 if v > 1 else None,
        change_type=change_type, description=description, draw_count=len(draws),
        first_draw_date=draws[0].draw_date if draws else None, last_draw_date=draws[-1].draw_date if draws else None,
        content_hash=content_hash(draws), is_append_only=append_only, import_id=import_id, created_by=actor,
    )
    db.add(hv)
    db.flush()
    update_snapshot(db, game, hv, draws)
    return hv


def add_draws(db: Session, game: Game, items: list[DrawInput], actor: uuid.UUID | None, change_type: str = "import",
              import_id=None, description: str | None = None, ip: str | None = None) -> HistoricalVersion | None:
    """Agrega sorteos nuevos (fechas no existentes) como una nueva versión. Valida contra las reglas."""
    if not items:
        return None
    _lock(db, game)
    rules = to_engine_rules(active_rules_row(db, game))
    existing = {d.draw_date for d in draws_at(db, game)}
    last_date = max(existing) if existing else None
    seen = set()
    for it in items:
        errs = validate_values(rules, it.main, it.sn)
        if errs:
            raise ValueError(f"{it.draw_date}: " + "; ".join(errs))
        if it.draw_date in existing or it.draw_date in seen:
            raise ValueError(f"{it.draw_date}: ya existe un sorteo vigente en esa fecha")
        seen.add(it.draw_date)
    v = _next_version_number(db, game)
    for it in sorted(items, key=lambda x: x.draw_date):
        db.add(Draw(
            game_id=game.id, draw_date=it.draw_date, weekday=it.draw_date.weekday(), draw_number=it.draw_number,
            position_1=it.main[0], position_2=it.main[1], position_3=it.main[2], position_4=it.main[3],
            position_5=it.main[4], super_number=it.sn, valid_from_version=v, source_import_id=import_id,
            created_by=actor, change_reason=change_type,
        ))
    append_only = last_date is None or min(seen) > last_date
    hv = _finalize_version(db, game, v, change_type, description or f"{len(items)} sorteos agregados", actor,
                           import_id, append_only)
    audit(db, f"history.{change_type}", "historical_version", hv.version_number, actor,
          after={"game": game.code, "added": len(items), "version": v}, ip=ip)
    return hv


def correct_draw(db: Session, game: Game, draw_id: int, new: DrawInput, reason: str, actor: uuid.UUID,
                 ip: str | None = None) -> HistoricalVersion:
    _lock(db, game)
    old = db.get(Draw, draw_id)
    if old is None or old.game_id != game.id or old.valid_to_version is not None:
        raise ValueError("Sorteo inexistente o no vigente")
    rules = to_engine_rules(active_rules_row(db, game))
    errs = validate_values(rules, new.main, new.sn)
    if errs:
        raise ValueError("; ".join(errs))
    if new.draw_date != old.draw_date and new.draw_date in {d.draw_date for d in draws_at(db, game)}:
        raise ValueError("Ya existe un sorteo vigente en la nueva fecha")
    before = _draw_dict(old)
    v = _next_version_number(db, game)
    old.valid_to_version = v
    db.flush()
    nd = Draw(game_id=game.id, draw_date=new.draw_date, weekday=new.draw_date.weekday(),
              draw_number=new.draw_number if new.draw_number is not None else old.draw_number,
              position_1=new.main[0], position_2=new.main[1], position_3=new.main[2], position_4=new.main[3],
              position_5=new.main[4], super_number=new.sn, valid_from_version=v, supersedes_id=old.id,
              source_import_id=old.source_import_id, created_by=actor, change_reason=reason)
    db.add(nd)
    hv = _finalize_version(db, game, v, "correction", f"Corrección del sorteo {old.draw_date}: {reason}", actor)
    audit(db, "history.correction", "draw", old.id, actor, before=before, after=_draw_dict(nd),
          details={"reason": reason, "version": v, "game": game.code}, ip=ip)
    return hv


def delete_draw(db: Session, game: Game, draw_id: int, reason: str, actor: uuid.UUID,
                ip: str | None = None) -> HistoricalVersion:
    _lock(db, game)
    old = db.get(Draw, draw_id)
    if old is None or old.game_id != game.id or old.valid_to_version is not None:
        raise ValueError("Sorteo inexistente o no vigente")
    v = _next_version_number(db, game)
    old.valid_to_version = v
    hv = _finalize_version(db, game, v, "delete", f"Retiro del sorteo {old.draw_date}: {reason}", actor)
    audit(db, "history.delete", "draw", old.id, actor, before=_draw_dict(old),
          details={"reason": reason, "version": v, "game": game.code}, ip=ip)
    return hv


def _draw_dict(d: Draw) -> dict:
    return {"id": d.id, "draw_date": d.draw_date.isoformat(), "draw_number": d.draw_number,
            "numbers": [d.position_1, d.position_2, d.position_3, d.position_4, d.position_5],
            "super_number": d.super_number}


# ------------------------------------------------------------------ snapshots
def _domains(rules: EngineRules, frame: pd.DataFrame) -> dict[str, tuple[int, int]]:
    def rng(var_cols, lo, hi):
        if lo is not None and hi is not None:
            return (lo, hi)
        vals = frame[var_cols].to_numpy().ravel() if len(frame) else [0]
        return (int(min(vals)), int(max(vals)))
    main = rng(list(MAIN_VARIABLES), rules.main_min, rules.main_max)
    sn = rng(["sn"], rules.super_min, rules.super_max)
    return {v: (sn if v == "sn" else main) for v in VARIABLES}


def update_snapshot(db: Session, game: Game, hv: HistoricalVersion, draws: list[Draw] | None = None,
                    force_full: bool = False) -> StatisticalSnapshot:
    draws = draws if draws is not None else draws_at(db, game, hv.version_number)
    frame = frame_from_draws(draws)
    rules = to_engine_rules(active_rules_row(db, game))
    domains = _domains(rules, frame)
    prev = None
    if not force_full and hv.is_append_only and hv.version_number > 1:
        prev_v = version_by_number(db, game, hv.version_number - 1)
        prev = db.scalar(select(StatisticalSnapshot).where(
            StatisticalSnapshot.historical_version_id == prev_v.id, StatisticalSnapshot.kind == SNAPSHOT_KIND)) if prev_v else None
        if prev is not None and {k: tuple(v) for k, v in prev.payload["domains"].items()} != domains:
            prev = None  # cambió el dominio (reglas): reconstrucción completa
    if prev is not None:
        new_rows = frame[frame["draw_date"] > pd.Timestamp(prev.payload["last_draw_date"])] \
            if prev.payload["last_draw_date"] else frame
        payload = apply_draws(prev.payload, new_rows)
        computation = "incremental"
    else:
        payload = build_full(frame, domains)
        computation = "full"
    existing = db.scalar(select(StatisticalSnapshot).where(
        StatisticalSnapshot.historical_version_id == hv.id, StatisticalSnapshot.kind == SNAPSHOT_KIND))
    if existing:
        existing.payload, existing.payload_hash, existing.computation = payload, snapshot_hash(payload), computation
        snap = existing
    else:
        snap = StatisticalSnapshot(game_id=game.id, historical_version_id=hv.id, kind=SNAPSHOT_KIND,
                                   computation=computation, payload=payload, payload_hash=snapshot_hash(payload))
        db.add(snap)
    db.flush()
    return snap
