from __future__ import annotations

import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Request, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.core.deps import client_ip, require_admin
from app.db import get_db
from app.models import Game, HistoricalImport, Profile
from app.services import importer, jobs

router = APIRouter(prefix="/imports", tags=["Importación"])


def import_dict(i: HistoricalImport, full: bool = False) -> dict:
    d = {"id": str(i.id), "filename": i.filename, "file_format": i.file_format, "file_sha256": i.file_sha256,
         "file_size": i.file_size, "status": i.status, "rows_detected": i.rows_detected, "rows_valid": i.rows_valid,
         "rows_rejected": i.rows_rejected, "rows_duplicate_existing": i.rows_duplicate_existing,
         "rows_conflicting_existing": i.rows_conflicting_existing, "rows_inserted": i.rows_inserted,
         "created_at": i.created_at, "committed_at": i.committed_at, "created_by": str(i.created_by) if i.created_by else None}
    if full:
        d.update({"column_mapping": i.column_mapping, "report": i.report, "errors": i.errors})
    return d


def _get(db: Session, import_id: uuid.UUID) -> HistoricalImport:
    imp = db.get(HistoricalImport, import_id)
    if imp is None:
        raise HTTPException(404, "Importación no encontrada")
    return imp


@router.post("")
async def upload(request: Request, file: UploadFile = File(...), db: Session = Depends(get_db),
                 admin: Profile = Depends(require_admin)):
    content = await file.read()
    try:
        imp = importer.create_upload(db, file.filename or "archivo", content, admin.id, get_settings().max_upload_mb)
        prev = importer.preview(imp)
    except Exception as e:  # noqa: BLE001 - archivo ilegible
        db.rollback()
        raise HTTPException(422, f"No se pudo leer el archivo: {e}")
    db.commit()
    return {"import": import_dict(imp), "preview": prev}


@router.get("")
def list_imports(db: Session = Depends(get_db), _: Profile = Depends(require_admin)):
    return [import_dict(i) for i in db.scalars(select(HistoricalImport).order_by(HistoricalImport.created_at.desc()).limit(200))]


@router.get("/{import_id}")
def get_import(import_id: uuid.UUID, db: Session = Depends(get_db), _: Profile = Depends(require_admin)):
    return import_dict(_get(db, import_id), full=True)


@router.get("/{import_id}/preview")
def preview(import_id: uuid.UUID, sheet: str | None = None, db: Session = Depends(get_db),
            _: Profile = Depends(require_admin)):
    return importer.preview(_get(db, import_id), sheet)


@router.post("/{import_id}/validate")
def validate(import_id: uuid.UUID, mapping: importer.ImportMapping, db: Session = Depends(get_db),
             admin: Profile = Depends(require_admin)):
    imp = _get(db, import_id)
    try:
        rep = importer.validate_import(db, imp, mapping, admin.id)
    except ValueError as e:
        db.rollback()
        raise HTTPException(422, str(e))
    db.commit()
    return {"import": import_dict(imp, full=True), "report": rep}


@router.post("/{import_id}/commit")
def commit(import_id: uuid.UUID, request: Request, bg: BackgroundTasks, db: Session = Depends(get_db),
           admin: Profile = Depends(require_admin)):
    imp = _get(db, import_id)
    try:
        res = importer.commit_import(db, imp, admin.id, client_ip(request))
    except ValueError as e:
        db.rollback()
        raise HTTPException(422, str(e))
    job_ids = []
    if get_settings().auto_publish_on_new_data:
        for code in res["versions"]:
            g = db.scalar(select(Game).where(Game.code == code))
            job = jobs.enqueue(db, "publish_official", {"game_id": g.id}, admin.id)
            job_ids.append(job.id)
    db.commit()
    for j in job_ids:
        bg.add_task(jobs.run_job, j)
    return {"import": import_dict(imp, full=True), "publish_jobs": [str(j) for j in job_ids]}


@router.post("/{import_id}/cancel")
def cancel(import_id: uuid.UUID, db: Session = Depends(get_db), _: Profile = Depends(require_admin)):
    imp = _get(db, import_id)
    if imp.status == "committed":
        raise HTTPException(422, "Una importación confirmada no puede cancelarse; corrija los registros")
    imp.status = "cancelled"
    db.commit()
    return import_dict(imp)
