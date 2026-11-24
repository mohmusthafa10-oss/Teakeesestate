"""add property submission workflow

Revision ID: 43c5f0cc7276
Revises: pg_compat_0002
Create Date: 2026-11-23 23:03:30.947598

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '43c5f0cc7276'
down_revision: Union[str, None] = 'pg_compat_0002'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- Create enums as plain strings (SQLAlchemy will store as VARCHAR) ---
    op.create_table(
        "property_submissions",
        sa.Column("id", sa.String(length=36), primary_key=True, nullable=False),
        sa.Column("reference", sa.String(length=20), nullable=False, unique=True),
        sa.Column("seller_name", sa.String(length=100), nullable=False),
        sa.Column("phone", sa.String(length=50), nullable=False),
        sa.Column("type", sa.String(length=50), nullable=False),
        sa.Column("location", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("expected_price", sa.Numeric(14, 2), nullable=True),
        sa.Column("size", sa.Numeric(12, 2), nullable=True),
        sa.Column("bedrooms", sa.Integer, nullable=True),
        sa.Column("bathrooms", sa.Integer, nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("status", sa.String(length=30), nullable=False, server_default=sa.text("'Pending Review'")),
        sa.Column("contact_deadline_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("first_contact_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("contact_status", sa.String(length=30), nullable=True),
        sa.Column("assigned_agent_id", sa.String(length=36), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_by_user_id", sa.String(length=36), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
    )
    op.create_index(op.f('ix_property_submissions_status'), 'property_submissions', ['status'], unique=False)
    op.create_index(op.f('ix_property_submissions_reference'), 'property_submissions', ['reference'], unique=True)

    op.create_table(
        "submission_media",
        sa.Column("id", sa.String(length=36), primary_key=True, nullable=False),
        sa.Column("submission_id", sa.String(length=36), sa.ForeignKey("property_submissions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("original_filename", sa.String(length=255), nullable=False),
        sa.Column("storage_key", sa.String(length=500), nullable=False, unique=True),
        sa.Column("mime_type", sa.String(length=100), nullable=False),
        sa.Column("size", sa.Integer, nullable=False),
        sa.Column("category", sa.String(length=20), nullable=False),
        sa.Column("order", sa.Integer, nullable=False, server_default=sa.text('0')),
        sa.Column("thumbnail_key", sa.String(length=500), nullable=True),
        sa.Column("uploaded_by", sa.String(length=36), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
    )
    op.create_index(op.f('ix_submission_media_category'), 'submission_media', ['category'], unique=False)

    op.create_table(
        "property_publication",
        sa.Column("id", sa.String(length=36), primary_key=True, nullable=False),
        sa.Column("property_id", sa.String(length=36), sa.ForeignKey("properties.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("is_published", sa.Boolean, nullable=False, server_default=sa.text('false')),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("published_by_id", sa.String(length=36), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("unpublished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("unpublished_by_id", sa.String(length=36), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
    )

def downgrade() -> None:
    op.drop_table("property_publication")
    op.drop_index(op.f('ix_submission_media_category'), table_name='submission_media')
    op.drop_table("submission_media")
    op.drop_index(op.f('ix_property_submissions_reference'), table_name='property_submissions')
    op.drop_index(op.f('ix_property_submissions_status'), table_name='property_submissions')
    op.drop_table("property_submissions")


def downgrade() -> None:
    pass
