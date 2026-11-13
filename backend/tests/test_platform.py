"""Pruebas de servicios y API contra PostgreSQL (base sorteo_test, datos sintéticos)."""
from __future__ import annotations

import io
import threading
from datetime import date

import pandas as pd
import pytest
from sqlalchemy import func, select, text
from sqlalchemy.exc import DBAPIError

from app.db import SessionLocal
from app.models import Draw, Game, HistoricalVersion, Prediction, PredictionCandidate
from app.services import history, importer, predictions
from tests.conftest import login
from tests.synthetic import make_synthetic_rows


def _csv(rows, game_col=True) -> bytes:
    df = pd.DataFrame([{**({"juego": "TEST"} if game_col else {}), "Fecha": r["draw_date"].strftime("%d/%m/%Y"),
                        "Sorteo": r["draw_id"], "B1": r["p1"], "B2": r["p2"], "B3": r["p3"], "B4": r["p4"],
                        "B5": r["p5"], "Super": r["sn"]} for r in rows])
    return df.to_csv(index=False).encode()


MAP = {"game": "juego", "draw_date": "Fecha", "draw_number": "Sorteo", "position_1": "B1", "position_2": "B2",
       "position_3": "B3", "position_4": "B4", "position_5": "B5", "super_number": "Super"}


def _load(db, game, admin, n=200, seed=1):
    items = [history.DrawInput(r["draw_date"], [r["p1"], r["p2"], r["p3"], r["p4"], r["p5"]], r["sn"], r["draw_id"])
             for r in make_synthetic_rows(n, seed)]
    hv = history.add_draws(db, game, items, admin.id)
    db.commit()
    return hv


# ------------------------------------------------------------------ importación
def test_csv_import_flow_with_row_errors(db, game, admin):
    rows = make_synthetic_rows(30)
    content = bytearray(_csv(rows))
    bad = rows[0] | {"draw_date": pd.Timestamp("2019-12-30"), "p1": 0}  # fuera de rango
    unsorted = rows[1] | {"draw_date": pd.Timestamp("2019-12-28"), "p1": 40, "p2": 2}  # desordenado
    content += _csv([bad, unsorted, rows[2]], game_col=True).split(b"\n", 1)[1]  # + duplicado en archivo
    imp = importer.create_upload(db, "datos.csv", bytes(content), admin.id, 20)
    assert importer.preview(imp)["suggested_mapping"]["draw_date"] == "Fecha"
    rep = importer.validate_import(db, imp, importer.ImportMapping(columns=MAP), admin.id)
    types = sorted(e["type"] for e in rep["errors"])
    assert types == ["duplicado_en_archivo", "reglas", "reglas"]
    assert rep["rows_valid"] == 30
    res = importer.commit_import(db, imp, admin.id)
    db.commit()
    assert res["inserted"] == 30 and res["versions"] == {"TEST": 1}
    # orden de posiciones conservado
    d = db.scalar(select(Draw).where(Draw.draw_date == rows[5]["draw_date"]))
    assert [d.position_1, d.position_2, d.position_3, d.position_4, d.position_5] == \
        [rows[5][k] for k in ("p1", "p2", "p3", "p4", "p5")]


def test_excel_import_and_duplicate_detection(db, game, admin):
    rows = make_synthetic_rows(20)
    df = pd.read_csv(io.BytesIO(_csv(rows)))
    buf = io.BytesIO()
    df.to_excel(buf, index=False)
    imp = importer.create_upload(db, "datos.xlsx", buf.getvalue(), admin.id, 20)
    importer.validate_import(db, imp, importer.ImportMapping(columns=MAP), admin.id)
    importer.commit_import(db, imp, admin.id)
    db.commit()
    # reimportar: todo detectado como existente idéntico; un valor distinto es conflicto
    rows[3] = rows[3] | {"sn": (rows[3]["sn"] % 16) + 1}
    imp2 = importer.create_upload(db, "otra.csv", _csv(rows), admin.id, 20)
    rep = importer.validate_import(db, imp2, importer.ImportMapping(columns=MAP), admin.id)
    assert rep["rows_duplicate_existing"] == 19 and rep["rows_conflicting_existing"] == 1 and rep["rows_valid"] == 0


# ------------------------------------------------------------------ versionado e inmutabilidad
def test_correction_creates_version_and_preserves_original(db, game, admin):
    _load(db, game, admin, 50)
    d = history.draws_at(db, game)[10]
    original = [d.position_1, d.position_2, d.position_3, d.position_4, d.position_5, d.super_number]
    hv = history.correct_draw(db, game, d.id, history.DrawInput(d.draw_date, [1, 2, 3, 4, 5], 9), "error de captura", admin.id)
    db.commit()
    assert hv.version_number == 2 and hv.change_type == "correction"
    v1 = {x.draw_date: x for x in history.draws_at(db, game, 1)}
    v2 = {x.draw_date: x for x in history.draws_at(db, game, 2)}
    old, new = v1[d.draw_date], v2[d.draw_date]
    assert [old.position_1, old.position_2, old.position_3, old.position_4, old.position_5, old.super_number] == original
    assert [new.position_1, new.super_number] == [1, 9] and new.supersedes_id == old.id
    assert len(v1) == len(v2) == 50


def test_draw_rows_are_immutable_in_database(db, game, admin):
    _load(db, game, admin, 10)
    with pytest.raises(DBAPIError):
        db.execute(text("UPDATE draws SET super_number = 1 WHERE id = (SELECT min(id) FROM draws)"))
    db.rollback()
    with pytest.raises(DBAPIError):
        db.execute(text("DELETE FROM draws"))
    db.rollback()


def test_incremental_snapshot_matches_rebuild(db, game, admin):
    rows = make_synthetic_rows(120, 9)
    items = [history.DrawInput(r["draw_date"], [r["p1"], r["p2"], r["p3"], r["p4"], r["p5"]], r["sn"]) for r in rows]
    history.add_draws(db, game, items[:80], admin.id)
    hv2 = history.add_draws(db, game, items[80:], admin.id)
    db.commit()
    from app.models import StatisticalSnapshot

    inc = db.scalar(select(StatisticalSnapshot).where(StatisticalSnapshot.historical_version_id == hv2.id))
    assert inc.computation == "incremental"
    inc_hash = inc.payload_hash
    full = history.update_snapshot(db, game, hv2, force_full=True)
    assert full.computation == "full" and full.payload_hash == inc_hash


# ------------------------------------------------------------------ predicciones oficiales
def test_official_prediction_idempotent_immutable_and_superseded(db, game, admin):
    _load(db, game, admin, 200)
    p1, created = predictions.publish_official(db, game, admin.id)
    db.commit()
    assert created and p1.status == "published" and p1.target_date.weekday() in (0, 2, 5)
    p1b, created_b = predictions.publish_official(db, game, admin.id)
    db.commit()
    assert not created_b and p1b.id == p1.id
    # inmutable
    with pytest.raises(DBAPIError):
        db.execute(text("UPDATE prediction_candidates SET number = 1 WHERE prediction_id = :p"), {"p": p1.id})
    db.rollback()
    with pytest.raises(DBAPIError):
        db.execute(text("UPDATE predictions SET prediction_hash = 'x' WHERE id = :p"), {"p": p1.id})
    db.rollback()
    # una corrección del histórico produce una nueva versión y una nueva predicción; la anterior se conserva
    d = history.draws_at(db, game)[5]
    history.correct_draw(db, game, d.id, history.DrawInput(d.draw_date, [2, 3, 4, 5, 6], 1), "corrección", admin.id)
    db.commit()
    p2, created2 = predictions.publish_official(db, game, admin.id, p1.target_date)
    db.commit()
    db.refresh(p1)
    assert created2 and p1.status == "superseded" and p1.superseded_by_id == p2.id
    assert db.scalar(select(func.count()).select_from(Prediction).where(Prediction.status == "published")) == 1


def test_concurrent_publication_creates_single_prediction(db, game, admin):
    _load(db, game, admin, 150)
    gid = game.id
    results, errors = [], []

    def worker():
        s = SessionLocal()
        try:
            g = s.get(Game, gid)
            p, created = predictions.publish_official(s, g, None)
            s.commit()
            results.append((p.id, created))
        except Exception as e:  # noqa: BLE001
            s.rollback()
            errors.append(e)
        finally:
            s.close()

    threads = [threading.Thread(target=worker) for _ in range(4)]
    [t.start() for t in threads]
    [t.join() for t in threads]
    assert not errors
    assert len({r[0] for r in results}) == 1
    assert sum(r[1] for r in results) == 1
    assert db.scalar(select(func.count()).select_from(Prediction)) == 1


def test_live_evaluation_after_actual_draw(db, game, admin):
    _load(db, game, admin, 120)
    p, _ = predictions.publish_official(db, game, admin.id)
    db.commit()
    history.add_draws(db, game, [history.DrawInput(p.target_date, [3, 9, 20, 30, 41], 5)], admin.id)
    assert predictions.evaluate_pending(db, game) == 1
    db.commit()
    from app.models import PredictionEvaluation

    ev = db.scalar(select(PredictionEvaluation).where(PredictionEvaluation.prediction_id == p.id))
    r = ev.results
    assert r["format"] == "numbers_v1" and r["actual"]["super_number"] == 5
    assert r["matches"] == len(set(r["suggested"]["numbers"]) & {3, 9, 20, 30, 41})


# ------------------------------------------------------------------ API y roles
def test_roles_and_auth(client, db, game, admin, user):
    assert client.get("/api/games").status_code == 401
    hu = login(client, "user@test.example", "user-password-123")
    ha = login(client, "admin@test.example", "admin-password-123")
    assert client.get("/api/games", headers=hu).status_code == 200
    for method, url in [("get", "/api/admin/users"), ("get", "/api/admin/audit"), ("get", "/api/imports"),
                        ("post", "/api/games/TEST/predictions/publish"), ("post", "/api/games/TEST/backtests")]:
        r = getattr(client, method)(url, headers=hu, **({"json": {}} if method == "post" else {}))
        assert r.status_code == 403, url
    assert client.get("/api/admin/users", headers=ha).status_code == 200
    r = client.post("/api/auth/login", json={"email": "admin@test.example", "password": "incorrecta-123"})
    assert r.status_code == 401


def test_same_official_prediction_for_all_users(client, db, game, admin, user):
    _load(db, game, admin, 150)
    predictions.publish_official(db, game, admin.id)
    db.commit()
    hu = login(client, "user@test.example", "user-password-123")
    ha = login(client, "admin@test.example", "admin-password-123")
    a = client.get("/api/games/TEST/predictions/official", headers=hu).json()
    b = client.get("/api/games/TEST/predictions/official", headers=ha).json()
    assert a["id"] == b["id"] and a["prediction_hash"] == b["prediction_hash"] and a["candidates"] == b["candidates"]
    assert db.scalar(select(func.count()).select_from(Prediction)) == 1  # consultar no genera predicciones
    ex = client.get(f"/api/predictions/{a['id']}/explain", headers=hu,
                    params={"variable": "sn", "number": a["candidates"]["sn"][0]["number"]})
    assert ex.status_code == 200 and ex.json()["explanation"]


def test_stats_endpoints_and_window_do_not_mutate(client, db, game, admin, user):
    _load(db, game, admin, 300)
    hu = login(client, "user@test.example", "user-password-123")
    before = db.scalar(select(func.count()).select_from(Draw))
    r = client.get("/api/games/TEST/stats/frequencies", headers=hu, params={"var": "p2", "mode": "last_n_draws", "n": 50})
    assert r.status_code == 200 and r.json()["window"]["n_draws"] == 50
    r = client.get("/api/games/TEST/stats/temporal/grouped", headers=hu, params={"dimension": "weekday"})
    assert r.status_code == 200 and len(r.json()["result"]["groups"]) == 3
    assert client.get("/api/games/TEST/stats/frequencies", headers=hu, params={"mode": "last_n_draws"}).status_code == 422
    assert db.scalar(select(func.count()).select_from(Draw)) == before
    assert db.scalar(select(func.count()).select_from(HistoricalVersion)) == 1


def test_rules_change_rejected_if_history_violates(client, db, game, admin):
    _load(db, game, admin, 50)
    ha = login(client, "admin@test.example", "admin-password-123")
    r = client.post("/api/games/TEST/rules", headers=ha, json={"name": "x", "main_min": 1, "main_max": 30,
                                                                "super_min": 1, "super_max": 16, "main_unique": True,
                                                                "main_order": "sorted_asc", "draw_weekdays": [0, 2, 5]})
    assert r.status_code == 422
