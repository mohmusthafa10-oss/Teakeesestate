"""
PostgreSQL-compatible server_default fixup migration.

Revision ID: pg_compat_0002
Revises: be4c25d2b067
Create Date: 2026-11-21

Addresses the difference in server_default syntax between SQLite and PostgreSQL:
  - SQLite uses: server_default='(CURRENT_TIMESTAMP)'
  - PostgreSQL uses: server_default=sa.text('now()')

This migration is SAFE and IDEMPOTENT for PostgreSQL. It runs ALTER COLUMN statements
only on PostgreSQL (detected via dialect name). On SQLite it is a no-op.

No data is deleted or overwritten. No destructive operations.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.engine.reflection import Inspector

revision: str = "pg_compat_0002"
down_revision: Union[str, None] = "be4c25d2b067"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Tables and their timestamp columns that need a PostgreSQL-safe server_default.
# Format: {table_name: [column_name, ...]}
TIMESTAMP_COLUMNS = {
    "users": ["created_at", "updated_at"],
    "sellers": ["created_at", "updated_at"],
    "properties": ["created_at", "updated_at"],
    "property_images": ["created_at", "updated_at"],
    "property_documents": ["created_at", "updated_at"],
    "price_histories": ["created_at"],
    "seller_advances": ["created_at", "updated_at"],
    "leads": ["created_at", "updated_at"],
    "property_matches": ["matched_at", "created_at", "updated_at"],
    "follow_ups": ["created_at", "updated_at"],
    "site_visits": ["created_at", "updated_at"],
    "deals": ["created_at", "updated_at"],
    "investors": ["created_at", "updated_at"],
    "investments": ["created_at", "updated_at"],
    "tenants": ["created_at", "updated_at"],
    "rental_bookings": ["created_at", "updated_at"],
    "expenses": ["created_at"],
    "activity_logs": ["timestamp"],
    "agency_settings": ["created_at", "updated_at"],
}


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        # No-op on SQLite — SQLite already works fine with CURRENT_TIMESTAMP
        return

    for table, columns in TIMESTAMP_COLUMNS.items():
        for col in columns:
            op.alter_column(
                table,
                col,
                existing_type=sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                existing_nullable=False,
            )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return

    # Restore the SQLite-style default (acceptable on PostgreSQL too)
    for table, columns in TIMESTAMP_COLUMNS.items():
        for col in columns:
            op.alter_column(
                table,
                col,
                existing_type=sa.DateTime(timezone=True),
                server_default=sa.text("CURRENT_TIMESTAMP"),
                existing_nullable=False,
            )
