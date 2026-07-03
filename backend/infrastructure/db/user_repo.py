"""
infrastructure/db/user_repo.py

Repository for the Clerk-keyed user_profiles / user_carts JSONB tables.

Same resilience contract as profiles_repo: every function is best-effort — a DB
outage returns a safe default ({} / []) instead of raising, so the chat stream
is never blocked by profile persistence.
"""

import logging
from typing import Optional

from sqlalchemy import select

from .database import DB_AVAILABLE, get_session
from .models import UserCart, UserProfile

logger = logging.getLogger("kapruka-user-repo")

# Hard cap on the accumulated_context document so a runaway LLM can't bloat rows.
MAX_CONTEXT_BYTES = 16_384


def _db_ready() -> bool:
    # Re-import to read the *current* module-level flag (set during lifespan).
    from . import database

    return database.DB_AVAILABLE


# ── User profile (accumulated_context JSONB) ─────────────────────────────────

async def get_accumulated_context(clerk_id: str) -> dict:
    """Fetch the persistent context ledger for a user. {} when absent/offline."""
    clerk_id = (clerk_id or "").strip()
    if not clerk_id or not _db_ready():
        return {}
    try:
        session = await get_session()
        async with session:
            row = await session.get(UserProfile, clerk_id)
            return dict(row.accumulated_context or {}) if row else {}
    except Exception as e:
        logger.warning("get_accumulated_context failed for '%s': %s", clerk_id, e)
        return {}


async def save_accumulated_context(clerk_id: str, context: dict) -> bool:
    """Upsert the accumulated_context JSONB for a user. False on failure."""
    clerk_id = (clerk_id or "").strip()
    if not clerk_id or not isinstance(context, dict) or not _db_ready():
        return False

    import json

    if len(json.dumps(context, ensure_ascii=False)) > MAX_CONTEXT_BYTES:
        logger.warning(
            "accumulated_context for '%s' exceeds %d bytes — skipping save.",
            clerk_id, MAX_CONTEXT_BYTES,
        )
        return False

    try:
        session = await get_session()
        async with session:
            async with session.begin():
                row = await session.get(UserProfile, clerk_id)
                if row is None:
                    row = UserProfile(clerk_id=clerk_id, accumulated_context=context)
                    session.add(row)
                else:
                    row.accumulated_context = context
        return True
    except Exception as e:
        logger.warning("save_accumulated_context failed for '%s': %s", clerk_id, e)
        return False


async def get_profile_row(clerk_id: str) -> Optional[dict]:
    """Full profile row as a dict, or None."""
    clerk_id = (clerk_id or "").strip()
    if not clerk_id or not _db_ready():
        return None
    try:
        session = await get_session()
        async with session:
            row = await session.get(UserProfile, clerk_id)
            return row.to_dict() if row else None
    except Exception as e:
        logger.warning("get_profile_row failed for '%s': %s", clerk_id, e)
        return None


# ── User cart (items JSONB) ──────────────────────────────────────────────────

async def get_cart_items(clerk_id: str) -> list:
    """Latest persisted cart items for a user. [] when absent/offline."""
    clerk_id = (clerk_id or "").strip()
    if not clerk_id or not _db_ready():
        return []
    try:
        session = await get_session()
        async with session:
            stmt = (
                select(UserCart)
                .where(UserCart.clerk_id == clerk_id)
                .order_by(UserCart.updated_at.desc())
                .limit(1)
            )
            row = (await session.execute(stmt)).scalars().first()
            return list(row.items or []) if row else []
    except Exception as e:
        logger.warning("get_cart_items failed for '%s': %s", clerk_id, e)
        return []


async def save_cart_items(clerk_id: str, items: list) -> bool:
    """Upsert the user's single cart row. False on failure."""
    clerk_id = (clerk_id or "").strip()
    if not clerk_id or not isinstance(items, list) or not _db_ready():
        return False
    try:
        session = await get_session()
        async with session:
            async with session.begin():
                # A cart row requires the FK parent — ensure the profile exists.
                profile = await session.get(UserProfile, clerk_id)
                if profile is None:
                    session.add(UserProfile(clerk_id=clerk_id, accumulated_context={}))

                stmt = (
                    select(UserCart)
                    .where(UserCart.clerk_id == clerk_id)
                    .order_by(UserCart.updated_at.desc())
                    .limit(1)
                )
                row = (await session.execute(stmt)).scalars().first()
                if row is None:
                    session.add(UserCart(clerk_id=clerk_id, items=items))
                else:
                    row.items = items
        return True
    except Exception as e:
        logger.warning("save_cart_items failed for '%s': %s", clerk_id, e)
        return False
