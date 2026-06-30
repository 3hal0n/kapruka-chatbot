"""
infrastructure/db/models.py

ORM models for the relational layer. Currently the GiftProfile that backs the
Occasion Vibe Calendar feature.
"""

import uuid
from datetime import date, datetime

from sqlalchemy import JSON, Date, DateTime, String, Text, Uuid, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base

# Store allergens as a JSON array. Use native JSONB on PostgreSQL (indexable,
# queryable) and fall back to generic JSON on SQLite for dev.
AllergyArray = JSON().with_variant(JSONB(), "postgresql")


class GiftProfile(Base):
    """A saved gift profile / calendar timeline event for a guest session."""

    __tablename__ = "gift_profiles"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    # Session identifier matching the frontend guest id (e.g. "ruki_ab12cd34").
    user_id: Mapped[str] = mapped_column(String(128), index=True, nullable=False)
    recipient_name: Mapped[str] = mapped_column(String(255), nullable=False)
    occasion: Mapped[str] = mapped_column(String(64), nullable=False)
    target_date: Mapped[date] = mapped_column(Date, nullable=False)
    vibe_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Excluded safety terms, e.g. ["nuts", "cashews"].
    allergies: Mapped[list] = mapped_column(
        AllergyArray, nullable=False, default=list
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    def to_dict(self) -> dict:
        return {
            "id": str(self.id),
            "user_id": self.user_id,
            "recipient_name": self.recipient_name,
            "occasion": self.occasion,
            "target_date": self.target_date.isoformat() if self.target_date else None,
            "vibe_summary": self.vibe_summary,
            "allergies": list(self.allergies or []),
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
