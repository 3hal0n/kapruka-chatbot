"""
infrastructure/db/session_repo.py

Data-access helpers for ChatSession — persists the three mutable Router
fields (st_memory.history, last_products, pending_gift_message) so any Cloud
Run instance can serve any user's next turn. Same defensive contract as
profiles_repo.py: a DB hiccup must never propagate into an active SSE chat
stream. Unlike profiles_repo.py, each function here wraps its own try/except
internally (rather than relying on callers to catch), since this path runs
on every single chat turn — much higher call volume than profile creation.
"""

import logging
from typing import Optional

from . import database  # reference database.DB_AVAILABLE live (it flips after init_db)
from .database import get_session
from .models import ChatSession

logger = logging.getLogger("kapruka-db")


async def load_session(user_id: str) -> Optional[ChatSession]:
    """Fetch the persisted session row for user_id, or None (miss / DB down)."""
    if not database.DB_AVAILABLE:
        return None
    try:
        session = await get_session()
        async with session:
            return await session.get(ChatSession, user_id)
    except Exception as e:
        logger.warning(f"load_session failed for {user_id}: {e}")
        return None


async def save_session(
    user_id: str,
    *,
    history: list,
    last_products: list,
    pending_gift_message: Optional[str],
) -> None:
    """Upsert the session row. Best-effort — swallows all DB errors."""
    if not database.DB_AVAILABLE:
        return
    try:
        session = await get_session()
        async with session:
            row = await session.get(ChatSession, user_id)
            if row is None:
                row = ChatSession(user_id=user_id)
                session.add(row)
            row.history = history
            row.last_products = last_products
            row.pending_gift_message = pending_gift_message
            await session.commit()
    except Exception as e:
        logger.warning(f"save_session failed for {user_id}: {e}")


async def clear_session(user_id: str) -> None:
    """Reset the persisted row's content in place (called from /api/reset)."""
    if not database.DB_AVAILABLE:
        return
    try:
        session = await get_session()
        async with session:
            row = await session.get(ChatSession, user_id)
            if row is not None:
                row.history = []
                row.last_products = []
                row.pending_gift_message = None
                await session.commit()
    except Exception as e:
        logger.warning(f"clear_session failed for {user_id}: {e}")
