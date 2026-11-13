"""Triggers de inmutabilidad: histórico, predicciones publicadas, candidatos y auditoría.

Revision ID: 0002
Revises: 0001
"""
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None

SQL_UP = r"""
-- draws: filas inmutables. Solo se permite cerrar una fila vigente (valid_to_version NULL → N).
CREATE OR REPLACE FUNCTION trg_draws_immutable() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Los sorteos históricos no se eliminan físicamente; use una nueva versión';
  END IF;
  IF OLD.valid_to_version IS NULL AND NEW.valid_to_version IS NOT NULL
     AND (to_jsonb(NEW) - 'valid_to_version' - 'updated_at') = (to_jsonb(OLD) - 'valid_to_version' - 'updated_at') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Los sorteos históricos son inmutables (id=%)', OLD.id;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER draws_immutable BEFORE UPDATE OR DELETE ON draws
  FOR EACH ROW EXECUTE FUNCTION trg_draws_immutable();

-- historical_versions: inmutables
CREATE OR REPLACE FUNCTION trg_no_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'La tabla % es de solo inserción', TG_TABLE_NAME;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER historical_versions_immutable BEFORE UPDATE OR DELETE ON historical_versions
  FOR EACH ROW EXECUTE FUNCTION trg_no_change();
CREATE TRIGGER audit_logs_immutable BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION trg_no_change();

-- predictions: una vez publicada, solo puede pasar a 'superseded' (registrando quién la reemplaza).
CREATE OR REPLACE FUNCTION trg_predictions_immutable() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('published', 'superseded') THEN
      RAISE EXCEPTION 'Una predicción publicada no puede eliminarse';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status = 'draft' THEN
    RETURN NEW;
  END IF;
  IF OLD.status = 'published' AND NEW.status = 'superseded'
     AND (to_jsonb(NEW) - 'status' - 'superseded_at' - 'superseded_by_id')
       = (to_jsonb(OLD) - 'status' - 'superseded_at' - 'superseded_by_id') THEN
    RETURN NEW;
  END IF;
  IF to_jsonb(NEW) = to_jsonb(OLD) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'La predicción % (%) es inmutable', OLD.id, OLD.status;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER predictions_immutable BEFORE UPDATE OR DELETE ON predictions
  FOR EACH ROW EXECUTE FUNCTION trg_predictions_immutable();

-- candidatos: inmutables salvo mientras la predicción está en borrador
CREATE OR REPLACE FUNCTION trg_candidates_immutable() RETURNS trigger AS $$
DECLARE st text;
BEGIN
  SELECT status INTO st FROM predictions WHERE id = OLD.prediction_id;
  IF st = 'draft' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  RAISE EXCEPTION 'Los candidatos de una predicción % son inmutables', st;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER prediction_candidates_immutable BEFORE UPDATE OR DELETE ON prediction_candidates
  FOR EACH ROW EXECUTE FUNCTION trg_candidates_immutable();
"""

SQL_DOWN = r"""
DROP TRIGGER IF EXISTS prediction_candidates_immutable ON prediction_candidates;
DROP TRIGGER IF EXISTS predictions_immutable ON predictions;
DROP TRIGGER IF EXISTS audit_logs_immutable ON audit_logs;
DROP TRIGGER IF EXISTS historical_versions_immutable ON historical_versions;
DROP TRIGGER IF EXISTS draws_immutable ON draws;
DROP FUNCTION IF EXISTS trg_candidates_immutable();
DROP FUNCTION IF EXISTS trg_predictions_immutable();
DROP FUNCTION IF EXISTS trg_no_change();
DROP FUNCTION IF EXISTS trg_draws_immutable();
"""


def upgrade() -> None:
    op.execute(SQL_UP)


def downgrade() -> None:
    op.execute(SQL_DOWN)
