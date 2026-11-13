"""Predicción por números (cualquier orden) y categorías de premio oficiales en las reglas.

Revision ID: 0004
Revises: 0003
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("game_rules", sa.Column("prize_categories", postgresql.JSONB(), nullable=True))
    op.add_column("game_rules", sa.Column("prize_source", sa.Text(), nullable=True))
    op.drop_constraint("ck_cand_var", "prediction_candidates", type_="check")
    op.create_check_constraint("ck_cand_var", "prediction_candidates",
                               "variable IN ('p1','p2','p3','p4','p5','sn','main')")


def downgrade() -> None:
    op.drop_constraint("ck_cand_var", "prediction_candidates", type_="check")
    op.create_check_constraint("ck_cand_var", "prediction_candidates",
                               "variable IN ('p1','p2','p3','p4','p5','sn')")
    op.drop_column("game_rules", "prize_source")
    op.drop_column("game_rules", "prize_categories")
