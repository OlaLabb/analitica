"""Importación flexible de CSV/Excel con mapeo de columnas, vista previa y validación por fila.

Flujo: upload (se guarda el archivo y se leen encabezados) → validate (mapeo + reglas → errores por
fila, duplicados, conflictos; no escribe sorteos) → commit (transacción: nuevas versiones del
histórico, una por juego afectado).

El archivo puede contener varios juegos: el mapeo admite una columna 'game' cuyos valores se
asocian a códigos de juego, o un juego fijo para todo el archivo.
"""
from __future__ import annotations

import hashlib
import io
import uuid
from datetime import date, datetime, timezone

import pandas as pd
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Game, HistoricalImport
from app.services import history
from app.services.audit import audit

FIELDS = ["draw_date", "position_1", "position_2", "position_3", "position_4", "position_5", "super_number"]
OPTIONAL_FIELDS = ["draw_number", "game"]
SYNONYMS = {
    "draw_date": ["draw_date", "fecha", "date", "fecha_sorteo", "fecha sorteo"],
    "draw_number": ["draw_number", "sorteo", "numero_sorteo", "número de sorteo", "nro_sorteo", "draw"],
    "game": ["game_type", "game", "juego", "tipo", "tipo_juego"],
    "super_number": ["super_number", "superbalota", "super balota", "super", "sb", "súper número", "super_numero"],
    **{f"position_{i}": [f"position_{i}", f"posicion_{i}", f"posición {i}", f"pos{i}", f"n{i}", f"bola_{i}",
                         f"balota_{i}", f"numero_{i}", f"num{i}"] for i in range(1, 6)},
}
DATE_FORMATS = ["%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%Y/%m/%d", "%m/%d/%Y", "%d.%m.%Y"]


class ImportMapping(BaseModel):
    columns: dict[str, str] = Field(description="campo → nombre de columna del archivo")
    date_format: str | None = None  # None = autodetección
    fixed_game: str | None = None  # código de juego para todo el archivo
    game_values: dict[str, str] | None = None  # valor en archivo → código de juego
    sheet_name: str | None = None
    skip_existing_identical: bool = True


def read_table(content: bytes, fmt: str, sheet: str | None = None) -> pd.DataFrame:
    if fmt == "csv":
        for enc in ("utf-8-sig", "latin-1"):
            try:
                return pd.read_csv(io.BytesIO(content), dtype=str, sep=None, engine="python", encoding=enc,
                                   keep_default_na=False)
            except UnicodeDecodeError:
                continue
        raise ValueError("No se pudo decodificar el CSV")
    xls = pd.ExcelFile(io.BytesIO(content))
    return pd.read_excel(xls, sheet_name=sheet or xls.sheet_names[0], dtype=str, keep_default_na=False)


def sheet_names(content: bytes, fmt: str) -> list[str]:
    return pd.ExcelFile(io.BytesIO(content)).sheet_names if fmt == "xlsx" else []


def suggest_mapping(columns: list[str]) -> dict[str, str]:
    norm = {c.strip().lower(): c for c in columns}
    out = {}
    for field, syns in SYNONYMS.items():
        for s in syns:
            if s in norm:
                out[field] = norm[s]
                break
    return out


def create_upload(db: Session, filename: str, content: bytes, actor: uuid.UUID, max_mb: int) -> HistoricalImport:
    if len(content) > max_mb * 1024 * 1024:
        raise ValueError(f"Archivo mayor a {max_mb} MB")
    ext = filename.lower().rsplit(".", 1)[-1]
    fmt = {"csv": "csv", "txt": "csv", "xlsx": "xlsx", "xls": "xlsx"}.get(ext)
    if fmt is None:
        raise ValueError("Formato no soportado (use CSV o Excel .xlsx)")
    df = read_table(content, fmt)
    imp = HistoricalImport(
        filename=filename[:300], file_format=fmt, file_sha256=hashlib.sha256(content).hexdigest(),
        file_size=len(content), file_content=content, status="uploaded", rows_detected=len(df), created_by=actor,
    )
    db.add(imp)
    db.flush()
    audit(db, "import.upload", "historical_import", imp.id, actor, details={"filename": filename, "rows": len(df)})
    return imp


def preview(imp: HistoricalImport, sheet: str | None = None, n: int = 20) -> dict:
    df = read_table(imp.file_content, imp.file_format, sheet)
    return {"columns": list(df.columns), "rows": df.head(n).to_dict(orient="records"), "total_rows": len(df),
            "sheets": sheet_names(imp.file_content, imp.file_format), "suggested_mapping": suggest_mapping(list(df.columns))}


def _parse_date(raw: str, fmt: str | None) -> date:
    raw = str(raw).strip()
    if fmt:
        return datetime.strptime(raw, fmt).date()
    for f in DATE_FORMATS:
        try:
            return datetime.strptime(raw[:10] if f == "%Y-%m-%d" else raw, f).date()
        except ValueError:
            continue
    raise ValueError(f"Fecha no reconocida: '{raw}'")


def _parse_int(raw) -> int:
    s = str(raw).strip()
    if s == "":
        raise ValueError("vacío")
    f = float(s.replace(",", "."))
    if f != int(f):
        raise ValueError(f"'{s}' no es entero")
    return int(f)


def analyze(db: Session, imp: HistoricalImport, mapping: ImportMapping) -> dict:
    """Valida todas las filas sin escribir sorteos. Devuelve informe y filas válidas por juego."""
    missing = [f for f in FIELDS if f not in mapping.columns]
    if missing:
        raise ValueError(f"Faltan columnas en el mapeo: {missing}")
    if "game" not in mapping.columns and not mapping.fixed_game:
        raise ValueError("Indique la columna de juego o un juego fijo para el archivo")
    df = read_table(imp.file_content, imp.file_format, mapping.sheet_name)
    for col in mapping.columns.values():
        if col not in df.columns:
            raise ValueError(f"La columna '{col}' no existe en el archivo")
    games = {g.code: g for g in db.scalars(select(Game))}
    errors: list[dict] = []
    valid: dict[str, list[tuple[int, history.DrawInput]]] = {}
    for i, row in df.iterrows():
        line = int(i) + 2  # fila 1 = encabezado
        try:
            if mapping.fixed_game:
                code = mapping.fixed_game.upper()
            else:
                raw = str(row[mapping.columns["game"]]).strip()
                code = (mapping.game_values or {}).get(raw, raw).upper()
            if code not in games:
                raise ValueError(f"Juego desconocido '{code}'")
            d = _parse_date(row[mapping.columns["draw_date"]], mapping.date_format)
            main = [_parse_int(row[mapping.columns[f"position_{k}"]]) for k in range(1, 6)]
            sn = _parse_int(row[mapping.columns["super_number"]])
            dn = _parse_int(row[mapping.columns["draw_number"]]) if "draw_number" in mapping.columns and \
                str(row[mapping.columns["draw_number"]]).strip() else None
        except (ValueError, KeyError) as e:
            errors.append({"row": line, "type": "formato", "message": str(e)})
            continue
        valid.setdefault(code, []).append((line, history.DrawInput(d, main, sn, dn)))
    report_games = {}
    to_insert: dict[str, list[history.DrawInput]] = {}
    dup_existing = conflicts = 0
    for code, items in valid.items():
        game = games[code]
        rules = history.to_engine_rules(history.active_rules_row(db, game))
        existing = {d.draw_date: d for d in history.draws_at(db, game)}
        seen: dict[date, int] = {}
        ok: list[history.DrawInput] = []
        for line, it in items:
            errs = history.validate_values(rules, it.main, it.sn)
            if errs:
                errors.append({"row": line, "game": code, "type": "reglas", "message": "; ".join(errs)})
                continue
            if it.draw_date in seen:
                errors.append({"row": line, "game": code, "type": "duplicado_en_archivo",
                               "message": f"Fecha {it.draw_date} repetida (también en fila {seen[it.draw_date]})"})
                continue
            seen[it.draw_date] = line
            ex = existing.get(it.draw_date)
            if ex is not None:
                same = [ex.position_1, ex.position_2, ex.position_3, ex.position_4, ex.position_5] == it.main \
                    and ex.super_number == it.sn
                if same:
                    dup_existing += 1
                    continue
                conflicts += 1
                errors.append({"row": line, "game": code, "type": "conflicto_con_historico",
                               "message": f"Ya existe el sorteo {it.draw_date} con valores distintos; "
                                          "use la corrección de registros para cambiarlo."})
                continue
            ok.append(it)
        to_insert[code] = ok
        dates = sorted(x.draw_date for x in ok)
        report_games[code] = {
            "valid_new": len(ok), "first_date": dates[0].isoformat() if dates else None,
            "last_date": dates[-1].isoformat() if dates else None,
            "rules_confirmed": rules.fully_confirmed,
            "observed": _observed(ok),
        }
    report = {
        "rows_detected": len(df), "rows_valid": sum(len(v) for v in to_insert.values()),
        "rows_rejected": len(errors),
        "rows_duplicate_existing": dup_existing, "rows_conflicting_existing": conflicts,
        "games": report_games, "errors": errors[:1000], "errors_truncated": len(errors) > 1000,
    }
    return {"report": report, "to_insert": to_insert}


def _observed(items: list[history.DrawInput]) -> dict:
    """Propiedades observadas útiles para que el administrador confirme reglas (no se imponen)."""
    if not items:
        return {}
    mains = [x.main for x in items]
    return {
        "main_min": min(min(m) for m in mains), "main_max": max(max(m) for m in mains),
        "super_min": min(x.sn for x in items), "super_max": max(x.sn for x in items),
        "all_sorted_ascending": all(all(a < b for a, b in zip(m, m[1:])) for m in mains),
        "any_repeated_within_draw": any(len(set(m)) < 5 for m in mains),
        "weekdays": sorted({x.draw_date.weekday() for x in items}),
    }


def validate_import(db: Session, imp: HistoricalImport, mapping: ImportMapping, actor: uuid.UUID) -> dict:
    if imp.status not in ("uploaded", "validated"):
        raise ValueError(f"La importación está en estado '{imp.status}'")
    res = analyze(db, imp, mapping)
    rep = res["report"]
    imp.column_mapping = mapping.model_dump()
    imp.status = "validated"
    imp.rows_valid, imp.rows_rejected = rep["rows_valid"], len(rep["errors"])
    imp.rows_duplicate_existing, imp.rows_conflicting_existing = rep["rows_duplicate_existing"], rep["rows_conflicting_existing"]
    imp.errors, imp.report = rep["errors"], rep
    return rep


def commit_import(db: Session, imp: HistoricalImport, actor: uuid.UUID, ip: str | None = None) -> dict:
    """Escribe los sorteos válidos. Transaccional: si algo falla no queda nada a medias."""
    if imp.status != "validated" or not imp.column_mapping:
        raise ValueError("Primero valide la importación")
    mapping = ImportMapping(**imp.column_mapping)
    res = analyze(db, imp, mapping)  # re-validación contra el estado actual (pudo cambiar)
    games = {g.code: g for g in db.scalars(select(Game))}
    versions = {}
    inserted = 0
    for code, items in res["to_insert"].items():
        if not items:
            continue
        hv = history.add_draws(db, games[code], items, actor, "import", import_id=imp.id,
                               description=f"Importación '{imp.filename}'", ip=ip)
        versions[code] = hv.version_number
        inserted += len(items)
    imp.status = "committed"
    imp.rows_inserted = inserted
    imp.committed_at = datetime.now(timezone.utc)
    imp.report = {**res["report"], "resulting_versions": versions}
    imp.errors = res["report"]["errors"]
    audit(db, "import.commit", "historical_import", imp.id, actor,
          after={"inserted": inserted, "versions": versions}, ip=ip)
    return {"inserted": inserted, "versions": versions, "report": imp.report}
