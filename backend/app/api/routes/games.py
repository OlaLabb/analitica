from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.deps import client_ip, get_current_user, get_game, require_admin
from app.db import get_db
from app.engine.snapshots import SNAPSHOT_KIND, summary_from_snapshot
from app.models import (
    BacktestRun, Game, GameRules, HistoricalVersion, Prediction, PredictionEvaluation, Profile, StatisticalSnapshot,
)
from app.services import history
from app.services.audit import audit
from app.services.predictions import next_draw_date

router = APIRouter(tags=["Juegos y reglas"])


def rules_dict(r: GameRules | None) -> dict | None:
    if r is None:
        return None
    return {"id": r.id, "version_number": r.version_number, "name": r.name, "main_min": r.main_min,
            "main_max": r.main_max, "super_min": r.super_min, "super_max": r.super_max, "main_unique": r.main_unique,
            "main_order": r.main_order, "draw_weekdays": r.draw_weekdays, "notes": r.notes,
            "prize_categories": r.prize_categories, "prize_source": r.prize_source,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "fully_confirmed": history.to_engine_rules(r).fully_confirmed}


def version_dict(v: HistoricalVersion | None) -> dict | None:
    if v is None:
        return None
    return {"id": v.id, "version_number": v.version_number, "change_type": v.change_type, "description": v.description,
            "draw_count": v.draw_count, "first_draw_date": v.first_draw_date, "last_draw_date": v.last_draw_date,
            "content_hash": v.content_hash, "is_append_only": v.is_append_only,
            "created_at": v.created_at.isoformat() if v.created_at else None}


@router.get("/games")
def list_games(db: Session = Depends(get_db), _: Profile = Depends(get_current_user)):
    out = []
    for g in db.scalars(select(Game).order_by(Game.id)):
        hv = history.current_version(db, g)
        out.append({"code": g.code, "name": g.name, "description": g.description, "is_active": g.is_active,
                    "draw_count": hv.draw_count if hv else 0, "last_draw_date": hv.last_draw_date if hv else None})
    return out


@router.get("/games/{game_code}/summary")
def game_summary(game: Game = Depends(get_game), db: Session = Depends(get_db), _: Profile = Depends(get_current_user)):
    """Resumen para el dashboard (datos reales del backend)."""
    hv = history.current_version(db, game)
    rules = history.active_rules_row(db, game)
    official = db.scalar(select(Prediction).where(Prediction.game_id == game.id, Prediction.kind == "official",
                                                  Prediction.status == "published")
                         .order_by(Prediction.target_date.desc()).limit(1))
    last_bt = db.scalar(select(BacktestRun).where(BacktestRun.game_id == game.id)
                        .order_by(BacktestRun.started_at.desc()).limit(1))
    last_live = db.scalar(select(PredictionEvaluation).join(Prediction, Prediction.id == PredictionEvaluation.prediction_id)
                          .where(Prediction.game_id == game.id, PredictionEvaluation.kind == "live")
                          .order_by(PredictionEvaluation.target_date.desc()).limit(1))
    snap = None
    if hv:
        s = db.scalar(select(StatisticalSnapshot).where(StatisticalSnapshot.historical_version_id == hv.id,
                                                        StatisticalSnapshot.kind == SNAPSHOT_KIND))
        snap = {"computation": s.computation, "summary": summary_from_snapshot(s.payload)} if s else None
    years = None
    if hv and hv.first_draw_date and hv.last_draw_date:
        years = round((hv.last_draw_date - hv.first_draw_date).days / 365.25, 2)
    next_date = None
    try:
        next_date = next_draw_date(rules.draw_weekdays if rules else None, hv.last_draw_date if hv else None)
    except ValueError:
        pass
    return {
        "game": {"code": game.code, "name": game.name},
        "history": version_dict(hv),
        "years_covered": years,
        "rules": rules_dict(rules),
        "next_target_date": next_date,
        "official_prediction": {"id": str(official.id), "target_date": official.target_date,
                                "format": (official.support_metrics or {}).get("format", "positional_v1"),
                                "suggested": (official.combinations or {}).get("suggested"),
                                "generated_at": official.generated_at, "historical_version_id": official.historical_version_id,
                                "prediction_hash": official.prediction_hash} if official else None,
        "last_backtest": {"id": str(last_bt.id), "status": last_bt.status, "started_at": last_bt.started_at,
                          "conclusion": (last_bt.summary or {}).get("conclusion")} if last_bt else None,
        "last_live_evaluation": {"target_date": last_live.target_date, "results": last_live.results} if last_live else None,
        "snapshot": snap,
    }


class RulesIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    main_min: int | None = None
    main_max: int | None = None
    super_min: int | None = None
    super_max: int | None = None
    main_unique: bool | None = None
    main_order: str = Field(default="unknown", pattern="^(sorted_asc|draw_order|unknown)$")
    draw_weekdays: list[int] | None = None
    notes: str | None = None
    prize_categories: list[dict] | None = None
    prize_source: str | None = None

    @model_validator(mode="after")
    def _check(self):
        if (self.main_min is None) != (self.main_max is None) or (self.super_min is None) != (self.super_max is None):
            raise ValueError("Indique mínimo y máximo juntos")
        if self.main_min is not None and self.main_min > self.main_max:
            raise ValueError("main_min > main_max")
        if self.super_min is not None and self.super_min > self.super_max:
            raise ValueError("super_min > super_max")
        if self.main_unique and self.main_min is not None and self.main_max - self.main_min + 1 < 5:
            raise ValueError("El rango no admite 5 números distintos")
        if self.draw_weekdays is not None and any(not 0 <= d <= 6 for d in self.draw_weekdays):
            raise ValueError("Días de la semana entre 0 (lunes) y 6 (domingo)")
        for c in self.prize_categories or []:
            if not isinstance(c.get("matches"), int) or not 0 <= c["matches"] <= 5 or not isinstance(c.get("super"), bool):
                raise ValueError("Cada categoría de premio requiere 'matches' (0-5) y 'super' (true/false)")
        return self


@router.get("/games/{game_code}/rules")
def get_rules(game: Game = Depends(get_game), db: Session = Depends(get_db), _: Profile = Depends(get_current_user)):
    rows = db.scalars(select(GameRules).where(GameRules.game_id == game.id).order_by(GameRules.version_number.desc()))
    return {"active": rules_dict(history.active_rules_row(db, game)), "history": [rules_dict(r) for r in rows]}


@router.post("/games/{game_code}/rules")
def set_rules(body: RulesIn, request: Request, game: Game = Depends(get_game), db: Session = Depends(get_db),
              admin: Profile = Depends(require_admin)):
    """Crea una nueva versión de reglas y la activa (las anteriores se conservan)."""
    frame = history.load_frame(db, game)
    from app.engine.rules import GameRules as ER

    er = ER(body.main_min, body.main_max, body.super_min, body.super_max, body.main_unique, body.main_order,
            tuple(body.draw_weekdays) if body.draw_weekdays else None)
    bad = []
    for r in frame.itertuples():
        errs = history.validate_values(er, [r.p1, r.p2, r.p3, r.p4, r.p5], r.sn)
        if errs:
            bad.append({"draw_date": r.draw_date.date().isoformat(), "errors": errs})
    if bad:
        raise HTTPException(422, {"message": f"{len(bad)} sorteos vigentes no cumplen las reglas propuestas",
                                  "examples": bad[:20]})
    prev = history.active_rules_row(db, game)
    if prev:
        prev.is_active = False
        db.flush()
    last = db.scalar(select(func.max(GameRules.version_number)).where(GameRules.game_id == game.id)) or 0
    r = GameRules(game_id=game.id, version_number=last + 1, is_active=True, created_by=admin.id,
                  **body.model_dump())
    db.add(r)
    db.flush()
    hv = history.current_version(db, game)
    if hv:
        history.update_snapshot(db, game, hv, force_full=True)
    audit(db, "rules.update", "game_rules", r.id, admin.id, before=rules_dict(prev), after=rules_dict(r),
          ip=client_ip(request))
    db.commit()
    return rules_dict(r)
