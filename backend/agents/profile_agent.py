"""
agents/profile_agent.py

Persistent Context Profile Agent (the "Memory Log").

On every conversational turn it compares the incoming user statement against the
stored accumulated_context JSONB and produces an updated profile document:
relationships, lifestyle needs/roles, and shopping bias. It never surfaces
itself in the conversation — it only maintains the ledger.

Resilience contract: run_profile_agent_turn NEVER raises. On any LLM/parse
failure it returns the previous profile unchanged, so the chat pipeline is
never blocked by memory maintenance.
"""

import json
import logging

from infrastructure.llm.client import async_chat, LLMUnavailableError, is_mock_mode

logger = logging.getLogger("kapruka-profile-agent")

PROFILE_MODEL = "gemini-2.5-flash"
PROFILE_MAX_TOKENS = 1024

PROFILE_ENGINE_PROMPT = """
ROLE: Persistent Context Extraction Ledger Agent
MISSION: Track and update long-term implicit traits of the user based on historical conversation snapshots.

CORE CONTEXT CATEGORIES TO TRACK:
- Relationships (e.g., "Has a girlfriend", "Sister getting married")
- Lifestyle Needs & Roles (e.g., "Software developer", "Prefers high-volume upper body workout metrics")
- Shopping Bias (e.g., "Buys electronic accessories directly", "Checks grocery essentials regularly")

OPERATIONAL PROTOCOL:
- Compare the incoming user statement against the historical profile file.
- Update fields cleanly inside the updated profile state database block.
- DO NOT hallucinate records or mention this profile layer directly in standard conversation.
- Output ONLY a single valid JSON object with exactly these top-level keys:
  {{"relationships": [..strings..], "lifestyle": [..strings..], "shopping_bias": [..strings..], "notes": [..strings..]}}
- Preserve every still-valid existing entry; add new facts; rewrite entries that
  the new statement contradicts. Keep each list under 20 short entries.
- If the statement contains no new long-term signal, return the current profile unchanged.

CURRENT ACCUMULATED PROFILE:
{historical_profile_json}
"""

_PROFILE_KEYS = ("relationships", "lifestyle", "shopping_bias", "notes")


def _normalise_profile(doc: dict) -> dict:
    """Coerce the LLM output into the canonical ledger shape."""
    clean: dict = {}
    for key in _PROFILE_KEYS:
        values = doc.get(key)
        if isinstance(values, str):
            values = [values]
        if not isinstance(values, list):
            values = []
        # De-dupe, drop empties, cap length so the JSONB row stays bounded.
        seen: list[str] = []
        for v in values:
            s = str(v).strip()
            if s and s not in seen:
                seen.append(s)
        clean[key] = seen[:20]
    return clean


async def run_profile_agent_turn(
    user_message: str,
    historical_profile: dict,
) -> dict:
    """Return the updated accumulated_context document for this turn.

    Falls back to the untouched historical profile on ANY failure.
    """
    historical_profile = historical_profile if isinstance(historical_profile, dict) else {}
    message = (user_message or "").strip()
    if not message:
        return historical_profile

    # Offline dev (no API key): keep the ledger as-is rather than inventing facts.
    if is_mock_mode():
        return historical_profile

    system = PROFILE_ENGINE_PROMPT.format(
        historical_profile_json=json.dumps(historical_profile, ensure_ascii=False)
    )

    try:
        raw = await async_chat(
            system=system,
            messages=[{"role": "user", "content": message}],
            max_tokens=PROFILE_MAX_TOKENS,
            model=PROFILE_MODEL,
            json_mode=True,
            temperature=0.1,
        )
    except LLMUnavailableError as e:
        logger.warning("Profile agent LLM unavailable — keeping prior profile: %s", e)
        return historical_profile
    except Exception as e:
        logger.warning("Profile agent turn failed — keeping prior profile: %s", e)
        return historical_profile

    # Robust JSON extraction (the model may wrap the object in prose/fences).
    clean = raw.strip()
    start, end = clean.find("{"), clean.rfind("}") + 1
    if start == -1 or end <= start:
        return historical_profile
    try:
        doc = json.loads(clean[start:end])
        if not isinstance(doc, dict):
            return historical_profile
        updated = _normalise_profile(doc)
        # Guard against a degenerate output that wipes an established ledger.
        if not any(updated.values()) and any(
            historical_profile.get(k) for k in _PROFILE_KEYS
        ):
            return historical_profile
        return updated
    except (json.JSONDecodeError, ValueError):
        return historical_profile


async def update_profile_for_user(clerk_id: str, user_message: str) -> dict:
    """Full JSONB update hook: load → LLM merge → persist. Never raises.

    This is the fire-and-forget task main.py schedules on every chat turn.
    """
    from infrastructure.db.user_repo import (
        get_accumulated_context,
        save_accumulated_context,
    )

    try:
        current = await get_accumulated_context(clerk_id)
        updated = await run_profile_agent_turn(user_message, current)
        if updated != current:
            await save_accumulated_context(clerk_id, updated)
            logger.info("Accumulated context updated for '%s'.", clerk_id)
        return updated
    except Exception as e:
        logger.warning("update_profile_for_user('%s') failed: %s", clerk_id, e)
        return {}
