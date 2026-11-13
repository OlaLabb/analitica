from __future__ import annotations

import json
import uuid

from sqlalchemy.orm import Session

from app.models import AuditLog


def _jsonable(x):
    return json.loads(json.dumps(x, default=str)) if x is not None else None


def audit(db: Session, action: str, entity_type: str, entity_id=None, actor: uuid.UUID | None = None,
          before=None, after=None, details=None, ip: str | None = None) -> None:
    """Registra una operación sensible. Se escribe en la MISMA transacción que la operación."""
    db.add(AuditLog(
        actor_id=actor, action=action, entity_type=entity_type,
        entity_id=str(entity_id) if entity_id is not None else None,
        before=_jsonable(before), after=_jsonable(after), details=_jsonable(details), ip_address=ip,
    ))
