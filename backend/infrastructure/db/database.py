"""
infrastructure/db/database.py

Async SQLAlchemy 2.0 engine + session factory for the relational layer that
backs the Occasion Vibe Calendar (gift profiles).

Design goals:
- PostgreSQL in production (``postgresql+asyncpg://...``) with a safe async
  connection pool; falls back to local async SQLite for zero-config dev so the
  app boots without a database server.
- NEVER crash the app or drop an active SSE chat stream on a DB hiccup. Engine
  creation and table init are best-effort; ``DB_AVAILABLE`` reflects status and
  callers degrade gracefully.
"""

import os
import logging
from typing import Optional

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

logger = logging.getLogger("kapruka-db")

# ── Connection URL ────────────────────────────────────────────────────────────
# Prod: postgresql+asyncpg://user:pass@host:5432/dbname
# Dev fallback: a local SQLite file via aiosqlite (no server required).


def _normalize_async_url(url: str) -> str:
    """Coerce a connection URL to an async driver create_async_engine accepts.

    Deployment (docker-compose) injects a plain ``postgresql://`` DSN, but the
    SQLAlchemy asyncio engine REQUIRES an async driver. Rewrite sync schemes to
    their async equivalents so the same env var works in prod and dev without
    the operator having to know about driver suffixes.
    """
    url = (url or "").strip()
    if url.startswith(("postgresql+asyncpg://", "sqlite+aiosqlite://")):
        return url
    if url.startswith("postgresql://"):
        return "postgresql+asyncpg://" + url[len("postgresql://"):]
    if url.startswith("postgres://"):  # some providers emit this short form
        return "postgresql+asyncpg://" + url[len("postgres://"):]
    if url.startswith("sqlite://") and "aiosqlite" not in url:
        return "sqlite+aiosqlite://" + url[len("sqlite://"):]
    return url


DATABASE_URL = _normalize_async_url(
    os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./gift_profiles.db")
)

_IS_POSTGRES = DATABASE_URL.startswith("postgresql")


class Base(DeclarativeBase):
    """Declarative base for all ORM models."""


# Module-level singletons — created lazily/safely in init_db().
engine: Optional[AsyncEngine] = None
SessionLocal: Optional[async_sessionmaker[AsyncSession]] = None

# Reflects whether the relational layer is usable this process.
DB_AVAILABLE: bool = False


def _build_engine() -> AsyncEngine:
    """Create the async engine with pooling tuned per backend."""
    if _IS_POSTGRES:
        # asyncpg pool: pre-ping to drop dead connections, recycle hourly so
        # idle conns don't get killed by the server mid-request.
        return create_async_engine(
            DATABASE_URL,
            pool_size=int(os.getenv("DB_POOL_SIZE", "10")),
            max_overflow=int(os.getenv("DB_MAX_OVERFLOW", "5")),
            pool_timeout=int(os.getenv("DB_POOL_TIMEOUT", "10")),
            pool_recycle=1800,
            pool_pre_ping=True,
            future=True,
        )
    # SQLite (aiosqlite): keep it simple; pre-ping still helps after laptop sleep.
    return create_async_engine(DATABASE_URL, pool_pre_ping=True, future=True)


async def init_db() -> bool:
    """
    Build the engine + session factory and create tables if missing.

    Returns True on success. On any failure logs and returns False WITHOUT
    raising, so the FastAPI app (and its SSE streams) keep running even when the
    database is unreachable.
    """
    global engine, SessionLocal, DB_AVAILABLE
    try:
        engine = _build_engine()
        SessionLocal = async_sessionmaker(
            engine, class_=AsyncSession, expire_on_commit=False
        )

        # Import models so they register on Base.metadata before create_all.
        from . import models  # noqa: F401

        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

        DB_AVAILABLE = True
        logger.info(
            "Relational DB ready (%s).",
            "PostgreSQL" if _IS_POSTGRES else "SQLite dev fallback",
        )
        return True
    except Exception as e:  # never fatal
        DB_AVAILABLE = False
        logger.warning(
            "Relational DB unavailable — gift-profile persistence disabled. "
            "App continues. Reason: %s",
            e,
        )
        return False


async def dispose_db() -> None:
    """Dispose the engine/pool on shutdown."""
    global engine
    if engine is not None:
        try:
            await engine.dispose()
        except Exception as e:
            logger.warning("Error disposing DB engine: %s", e)


async def get_session() -> AsyncSession:
    """
    Open a new AsyncSession. Caller is responsible for closing it (use as an
    ``async with`` context). Raises RuntimeError if the DB never initialised so
    HTTP routes can translate that into a clean 503.
    """
    if not DB_AVAILABLE or SessionLocal is None:
        raise RuntimeError("Database is not available.")
    return SessionLocal()
