"""add bedrooms bathrooms and media type

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-11-26 19:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("properties") as batch_op:
        batch_op.add_column(sa.Column("bedrooms", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("bathrooms", sa.Integer(), nullable=True))

    with op.batch_alter_table("property_images") as batch_op:
        batch_op.add_column(sa.Column("media_type", sa.String(length=20), nullable=False, server_default="photo"))
        batch_op.add_column(sa.Column("mime_type", sa.String(length=100), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("property_images") as batch_op:
        batch_op.drop_column("mime_type")
        batch_op.drop_column("media_type")

    with op.batch_alter_table("properties") as batch_op:
        batch_op.drop_column("bathrooms")
        batch_op.drop_column("bedrooms")
