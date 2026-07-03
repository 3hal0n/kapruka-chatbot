"""
infrastructure/auth/clerk_auth.py

Clerk session-token verification for FastAPI (PyJWT + JWKS).

The frontend sends `Authorization: Bearer <clerk_session_jwt>` on every backend
call. We verify the RS256 signature against Clerk's JWKS endpoint (keys cached
by PyJWKClient), then expose the immutable `sub` claim as the clerk_id.

Design constraints (must not break existing infra):
- Clerk is OPTIONAL. When CLERK_ISSUER / CLERK_JWKS_URL are unset, every request
  resolves to a guest identity and the app behaves exactly as before.
- `optional_identity` NEVER raises — invalid/missing tokens degrade to guest.
- `require_identity` raises 401 — used only on the new /api/me/* endpoints.
"""

import os
import logging
from dataclasses import dataclass, field
from typing import Optional

from fastapi import Header, HTTPException, status

logger = logging.getLogger("kapruka-clerk-auth")

# ── Configuration ─────────────────────────────────────────────────────────────
# CLERK_ISSUER example: https://your-app-12.clerk.accounts.dev
CLERK_ISSUER = os.getenv("CLERK_ISSUER", "").rstrip("/")
CLERK_JWKS_URL = os.getenv(
    "CLERK_JWKS_URL",
    f"{CLERK_ISSUER}/.well-known/jwks.json" if CLERK_ISSUER else "",
)
# Comma-separated list of allowed `azp` values (your frontend origins).
CLERK_AUTHORIZED_PARTIES = [
    p.strip() for p in os.getenv("CLERK_AUTHORIZED_PARTIES", "").split(",") if p.strip()
]


def clerk_configured() -> bool:
    return bool(CLERK_JWKS_URL)


@dataclass
class Identity:
    """Resolved caller identity for a request."""

    user_id: str                      # clerk_id when authed, else "" (guest)
    is_authenticated: bool = False
    claims: dict = field(default_factory=dict)

    @property
    def clerk_id(self) -> Optional[str]:
        return self.user_id if self.is_authenticated else None


GUEST = Identity(user_id="", is_authenticated=False)

# ── JWKS client (lazy, cached) ────────────────────────────────────────────────
_jwk_client = None


def _get_jwk_client():
    global _jwk_client
    if _jwk_client is None:
        import jwt  # PyJWT

        # PyJWKClient caches fetched signing keys internally.
        _jwk_client = jwt.PyJWKClient(CLERK_JWKS_URL, cache_keys=True, lifespan=3600)
    return _jwk_client


def verify_clerk_token(token: str) -> Identity:
    """Verify a Clerk session JWT. Raises jwt exceptions on failure."""
    import jwt  # PyJWT

    signing_key = _get_jwk_client().get_signing_key_from_jwt(token)
    decode_kwargs: dict = {
        "algorithms": ["RS256"],
        "options": {"require": ["exp", "iat", "sub"]},
        # Clerk session tokens have no `aud` by default.
        "audience": None,
    }
    if CLERK_ISSUER:
        decode_kwargs["issuer"] = CLERK_ISSUER

    claims = jwt.decode(
        token,
        signing_key.key,
        algorithms=decode_kwargs["algorithms"],
        issuer=decode_kwargs.get("issuer"),
        options={"require": ["exp", "iat", "sub"], "verify_aud": False},
        leeway=10,
    )

    # Optional azp allow-list (mitigates token replay from other frontends).
    azp = claims.get("azp")
    if CLERK_AUTHORIZED_PARTIES and azp and azp not in CLERK_AUTHORIZED_PARTIES:
        raise PermissionError(f"azp '{azp}' is not an authorized party")

    return Identity(user_id=claims["sub"], is_authenticated=True, claims=claims)


def _extract_bearer(authorization: Optional[str]) -> Optional[str]:
    if not authorization:
        return None
    parts = authorization.split(" ", 1)
    if len(parts) == 2 and parts[0].lower() == "bearer" and parts[1].strip():
        return parts[1].strip()
    return None


# ── FastAPI dependencies ──────────────────────────────────────────────────────

async def optional_identity(
    authorization: Optional[str] = Header(default=None),
) -> Identity:
    """Best-effort identity. Guest fallback on any failure — never raises."""
    token = _extract_bearer(authorization)
    if not token or not clerk_configured():
        return GUEST
    try:
        return verify_clerk_token(token)
    except Exception as e:
        logger.warning("Clerk token rejected (falling back to guest): %s", e)
        return GUEST


async def require_identity(
    authorization: Optional[str] = Header(default=None),
) -> Identity:
    """Hard-authenticated identity — 401 when the token is missing/invalid."""
    if not clerk_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication is not configured on this deployment.",
        )
    token = _extract_bearer(authorization)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        return verify_clerk_token(token)
    except Exception as e:
        logger.warning("Clerk token verification failed: %s", e)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session token.",
            headers={"WWW-Authenticate": "Bearer"},
        )
