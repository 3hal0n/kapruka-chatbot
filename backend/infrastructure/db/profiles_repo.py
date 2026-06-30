"""
infrastructure/db/profiles_repo.py

Data-access helpers for GiftProfile. Each opens/uses a short-lived AsyncSession.
All functions are defensive: a DB error is logged and surfaced as None / empty
rather than propagating into an active SSE chat stream.
"""

import logging
import uuid
from datetime import date
from typing import Optional

from sqlalchemy import select

from . import database  # reference database.DB_AVAILABLE live (it flips after init_db)
from .database import get_session
from .models import GiftProfile

logger = logging.getLogger("kapruka-db")


def days_until(target: date, today: Optional[date] = None) -> int:
    """Whole days until the next recurring occurrence of target's month/day.

    Mirrors the frontend countdown: if this year's date already passed, count to
    next year's. Returns 0 when the occasion is today.
    """
    today = today or date.today()
    try:
        this_year = target.replace(year=today.year)
    except ValueError:
        # Feb 29 on a non-leap year — fall back to Mar 1.
        this_year = date(today.year, 3, 1)
    nxt = this_year if this_year >= today else target.replace(year=today.year + 1)
    return (nxt - today).days


async def create_profile(
    *,
    user_id: str,
    recipient_name: str,
    occasion: str,
    target_date: date,
    vibe_summary: Optional[str],
    allergies: list[str],
) -> Optional[GiftProfile]:
    """Insert a new profile. Returns the persisted row, or None if DB is down."""
    if not database.DB_AVAILABLE:
        return None
    session = await get_session()
    async with session:
        profile = GiftProfile(
            user_id=user_id,
            recipient_name=recipient_name,
            occasion=occasion,
            target_date=target_date,
            vibe_summary=vibe_summary,
            allergies=[str(a).strip() for a in (allergies or []) if str(a).strip()],
        )
        session.add(profile)
        await session.commit()
        await session.refresh(profile)
        return profile


async def get_profiles_for_user(user_id: str) -> list[GiftProfile]:
    """All profiles for a session, ordered by proximity to the target date."""
    if not database.DB_AVAILABLE:
        return []
    session = await get_session()
    async with session:
        result = await session.execute(
            select(GiftProfile).where(GiftProfile.user_id == user_id)
        )
        rows = list(result.scalars().all())
    # Proximity ordering is recurrence-aware, so sort in Python (a SQL ORDER BY
    # on the raw stored date can't account for next-year rollover).
    rows.sort(key=lambda p: days_until(p.target_date))
    return rows


async def get_profile_by_id(profile_id: str) -> Optional[GiftProfile]:
    """Fetch a single profile by UUID. Returns None on miss / bad id / DB down."""
    if not database.DB_AVAILABLE:
        return None
    try:
        pid = uuid.UUID(str(profile_id))
    except (ValueError, TypeError):
        return None
    session = await get_session()
    async with session:
        return await session.get(GiftProfile, pid)


async def find_profile_by_recipient(
    user_id: str, needle: str
) -> Optional[GiftProfile]:
    """Best-effort match of a saved profile by recipient name within a message.

    Used for the implicit short-circuit ("show me a gift for Amma") when no
    explicit profile_id was supplied. Case-insensitive substring match; returns
    the soonest-upcoming match.
    """
    if not database.DB_AVAILABLE or not needle:
        return None
    needle_l = needle.lower()
    profiles = await get_profiles_for_user(user_id)
    matches = [p for p in profiles if p.recipient_name.lower() in needle_l]
    return matches[0] if matches else None
