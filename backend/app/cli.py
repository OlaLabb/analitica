"""CLI de administración. Uso: python -m app.cli <comando> [opciones]

  create-admin  --email E --name N [--password P]
  create-game   --code BALOTO --name "Baloto" [--description D]
  set-rules     --game BALOTO --main 1 43 --super 1 16 --unique yes --order sorted_asc --weekdays 0,2,5 --name N
  import-file   --file ruta.csv --email admin@... [--game-column game_type | --game BALOTO] [--map campo=columna ...]
  publish       --game BALOTO [--target 2026-11-14]
  backtest      --game BALOTO [--min-train 100]
  rebuild       --game BALOTO
"""
from __future__ import annotations

import argparse
import getpass
import sys
from datetime import date

from sqlalchemy import func, select

from app.db import SessionLocal
from app.models import Game, GameRules, Profile
from app.core.security import hash_password
from app.services import backtests, history, importer, predictions
from app.services.audit import audit


def _game(db, code: str) -> Game:
    g = db.scalar(select(Game).where(Game.code == code.upper()))
    if g is None:
        sys.exit(f"Juego {code} no existe")
    return g


def _parse_prizes(spec: str) -> list[dict]:
    out = []
    for part in spec.split(","):
        part = part.strip().upper().replace(" ", "")
        sb = part.endswith("+SB")
        k = int(part[:-3] if sb else part)
        out.append({"matches": k, "super": sb, "label": f"{k} + SB" if sb else str(k)})
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(prog="app.cli")
    sp = ap.add_subparsers(dest="cmd", required=True)
    a = sp.add_parser("create-admin"); a.add_argument("--email", required=True); a.add_argument("--name", required=True)
    a.add_argument("--password")
    g = sp.add_parser("create-game"); g.add_argument("--code", required=True); g.add_argument("--name", required=True)
    g.add_argument("--description")
    r = sp.add_parser("set-rules"); r.add_argument("--game", required=True); r.add_argument("--name", required=True)
    r.add_argument("--main", nargs=2, type=int); r.add_argument("--super", nargs=2, type=int)
    r.add_argument("--unique", choices=["yes", "no"]); r.add_argument("--order", default="unknown")
    r.add_argument("--weekdays"); r.add_argument("--notes")
    r.add_argument("--prizes", help='Categorías oficiales, p. ej. "5+SB,5,4+SB,4,3+SB,3,2+SB,0+SB"')
    r.add_argument("--prize-source", help="URL o documento oficial de donde se tomaron las categorías")
    i = sp.add_parser("import-file"); i.add_argument("--file", required=True); i.add_argument("--email", required=True)
    i.add_argument("--game-column"); i.add_argument("--game"); i.add_argument("--map", nargs="*", default=[])
    i.add_argument("--date-format")
    p = sp.add_parser("publish"); p.add_argument("--game", required=True); p.add_argument("--target")
    b = sp.add_parser("backtest"); b.add_argument("--game", required=True); b.add_argument("--min-train", type=int, default=100)
    rb = sp.add_parser("rebuild"); rb.add_argument("--game", required=True)
    args = ap.parse_args(argv)
    db = SessionLocal()
    try:
        if args.cmd == "create-admin":
            pw = args.password or getpass.getpass("Contraseña (mín. 10): ")
            if len(pw) < 10:
                sys.exit("La contraseña debe tener al menos 10 caracteres")
            u = db.scalar(select(Profile).where(func.lower(Profile.email) == args.email.lower()))
            if u:
                u.role, u.password_hash, u.is_active = "admin", hash_password(pw), True
            else:
                u = Profile(email=args.email, full_name=args.name, role="admin", password_hash=hash_password(pw))
                db.add(u)
            db.flush()
            audit(db, "user.create_admin_cli", "profile", u.id, None)
            print(f"Administrador listo: {u.email}")
        elif args.cmd == "create-game":
            if db.scalar(select(Game).where(Game.code == args.code.upper())):
                print("El juego ya existe")
            else:
                db.add(Game(code=args.code.upper(), name=args.name, description=args.description))
                print(f"Juego {args.code.upper()} creado")
        elif args.cmd == "set-rules":
            game = _game(db, args.game)
            prev = history.active_rules_row(db, game)
            if prev:
                prev.is_active = False
                db.flush()
            last = db.scalar(select(func.max(GameRules.version_number)).where(GameRules.game_id == game.id)) or 0
            rr = GameRules(game_id=game.id, version_number=last + 1, name=args.name, is_active=True,
                           main_min=args.main[0] if args.main else None, main_max=args.main[1] if args.main else None,
                           super_min=args.super[0] if args.super else None, super_max=args.super[1] if args.super else None,
                           main_unique=None if args.unique is None else args.unique == "yes", main_order=args.order,
                           draw_weekdays=[int(x) for x in args.weekdays.split(",")] if args.weekdays else None,
                           notes=args.notes, prize_source=args.prize_source,
                           prize_categories=_parse_prizes(args.prizes) if args.prizes else
                           (prev.prize_categories if prev else None))
            db.add(rr)
            db.flush()
            audit(db, "rules.update_cli", "game_rules", rr.id, None, after={"game": game.code, "version": rr.version_number})
            print(f"Reglas v{rr.version_number} activas para {game.code}")
        elif args.cmd == "import-file":
            admin = db.scalar(select(Profile).where(func.lower(Profile.email) == args.email.lower()))
            if admin is None or admin.role != "admin":
                sys.exit("Se requiere un administrador existente")
            content = open(args.file, "rb").read()
            imp = importer.create_upload(db, args.file.rsplit("/", 1)[-1], content, admin.id, 200)
            cols = importer.preview(imp)["suggested_mapping"]
            for m in args.map:
                k, v = m.split("=", 1)
                cols[k] = v
            if args.game_column:
                cols["game"] = args.game_column
            mapping = importer.ImportMapping(columns=cols, fixed_game=args.game, date_format=args.date_format)
            rep = importer.validate_import(db, imp, mapping, admin.id)
            print(f"Filas: {rep['rows_detected']} · válidas nuevas: {rep['rows_valid']} · rechazadas: {len(rep['errors'])}"
                  f" · ya existentes idénticas: {rep['rows_duplicate_existing']}")
            for e in rep["errors"][:10]:
                print("  ", e)
            res = importer.commit_import(db, imp, admin.id)
            print(f"Insertados: {res['inserted']} · versiones: {res['versions']}")
        elif args.cmd == "publish":
            game = _game(db, args.game)
            n = predictions.evaluate_pending(db, game)
            pred, created = predictions.publish_official(db, game, None, date.fromisoformat(args.target) if args.target else None)
            print(f"{'Publicada' if created else 'Ya existía (idempotente)'}: {pred.id} → {pred.target_date} hash {pred.prediction_hash[:12]} · evaluadas {n}")
        elif args.cmd == "backtest":
            game = _game(db, args.game)
            bt = backtests.create_backtest(db, game, {"min_train": args.min_train, "seed": 20240101}, None)
            s = backtests.execute_backtest(db, bt)
            print(f"Evaluación {bt.id}: {s['draws']} sorteos. {s['headline']} {s['conclusion']}")
        elif args.cmd == "rebuild":
            game = _game(db, args.game)
            hv = history.current_version(db, game)
            snap = history.update_snapshot(db, game, hv, force_full=True)
            print(f"Snapshot reconstruido v{hv.version_number}: {snap.payload_hash[:12]}")
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
