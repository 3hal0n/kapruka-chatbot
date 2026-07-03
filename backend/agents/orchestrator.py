"""
agents/orchestrator.py

Central Orchestrator Router + Sub-Agent Worker infrastructure.

Endpoints (mounted by main.py):
- POST /api/agent/chat     — one orchestrated multi-agent turn (JSON, non-streaming):
                             profile-ledger update → intent routing → SHOPPER /
                             LOGISTICS worker delegation.
- POST /api/vision/search  — multimodal computer-vision product search: image
                             upload → Gemini feature extraction → live Kapruka
                             catalog match.
- GET  /api/me/profile     — the caller's accumulated_context JSONB (Clerk auth).
- PUT  /api/me/cart        — persist the caller's cart JSONB (Clerk auth).
- GET  /api/me/cart        — fetch the caller's persisted cart (Clerk auth).

The existing SSE endpoint (/api/chat in main.py) remains the primary streaming
UI path; this router is the blueprint's structured agent gateway and the home
of the vision + profile APIs.
"""

import asyncio
import json
import logging
from typing import Any, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel

from google.genai import types

from infrastructure.auth.clerk_auth import Identity, optional_identity, require_identity
from infrastructure.llm.client import async_chat, LLMUnavailableError, is_mock_mode
from infrastructure.llm.vertex import get_vertex_client
from agents.profile_agent import run_profile_agent_turn

logger = logging.getLogger("kapruka-orchestrator")

router = APIRouter(tags=["orchestrator"])

ORCHESTRATOR_MODEL = "gemini-2.5-flash"
VISION_MODEL = "gemini-2.5-flash"
WORKER_MAX_TOKENS = 1024
ROUTING_MAX_TOKENS = 512
LLM_CALL_TIMEOUT_MS = 20_000  # google-genai http_options.timeout is MILLISECONDS

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/heic"}
MAX_IMAGE_BYTES = 8 * 1024 * 1024  # 8 MB upload cap


# ── Sub-agent system prompts ──────────────────────────────────────────────────

SHOPPER_AGENT_PROMPT = """
ROLE: General Store Shopper Agent
CONTEXT: You are the primary shopping worker for Kapruka AI. Kapruka is NOT just a gift shop—it carries an extensive collection of consumer goods including Electronics, Groceries, Personal Care, and Fashion. Most users shop for themselves, not for gifts.

MISSION: Convert consumer intent phrases into structured item search queries.

OPERATIONAL RULES:
1. If the user mentions hardware components, home appliances, or computing accessories (e.g., "PS5 Pro", "headphones"), prioritize exact matches from the Electronic Categories index instead of standard gift hampers.
2. Enrich abstract expressions into explicit keywords (e.g., "I need stuff for dinner" -> Query: "Basmati rice ingredients spices chicken").
3. Ensure search limits are parsed cleanly into numerical filtering ranges before querying product repositories.

OUTPUT FORMAT: Return ONLY a JSON object:
{"catalog_query": "concise keyword string", "max_price": number or null, "reply_intro": "one warm sentence introducing the results, Sri Lankan-friendly tone"}
"""

LOGISTICS_AGENT_PROMPT = """
ROLE: Logistics & Fulfillment Tracker Agent
MISSION: Extract geographical destinations, match them with canonical city mappings via Kapruka lookup endpoints, and handle real-time parcel trajectory states.

OPERATIONAL PARAMETERS:
- INTERCEPT user destination questions or tracking queries.
- Clean ambiguous locations to match valid distribution centers (e.g., "Colombo" -> Validate with city endpoints).
- Format parcel tracking status, handling variables like 'Arriving dates', 'Provider details', and state notes (e.g., "Waiting for customs clearance").
- Present data using clean Markdown layout specs for visual progress bars.

OUTPUT FORMAT: Return ONLY a JSON object:
{"location": "city name or null", "tracking_code": "code or null", "deadline": "date/occasion or null"}
"""


# ── Payload schemas ───────────────────────────────────────────────────────────

class AgentChatPayload(BaseModel):
    user_id: str = ""          # guest session id; ignored when a Clerk token is present
    message: str


class CartPutPayload(BaseModel):
    items: list[dict] = []


# ── Helpers ───────────────────────────────────────────────────────────────────

def _extract_json(raw: str) -> Optional[dict]:
    """Pull the first JSON object out of an LLM response, tolerating fences."""
    clean = (raw or "").strip()
    start, end = clean.find("{"), clean.rfind("}") + 1
    if start == -1 or end <= start:
        return None
    try:
        doc = json.loads(clean[start:end])
        return doc if isinstance(doc, dict) else None
    except json.JSONDecodeError:
        return None


def _normalise_products(search_res: Any, limit: int = 8) -> list[dict]:
    """Flatten the MCP search response into a plain product list."""
    products: list = []
    if isinstance(search_res, dict):
        products = search_res.get("products") or search_res.get("result") or []
    elif isinstance(search_res, list):
        products = search_res
    return [p for p in products if isinstance(p, dict)][:limit]


def _effective_user_id(identity: Identity, fallback: str) -> str:
    """Clerk id wins; otherwise the guest session id from the request body."""
    if identity.is_authenticated:
        return identity.user_id
    return (fallback or "").strip() or "guest"


# ── Sub-agent workers ─────────────────────────────────────────────────────────

async def execute_shopper_worker(
    enriched_query: str, profile: dict
) -> tuple[str, list[dict]]:
    """General Store Shopper: enrich the query, hit the live catalog, reply."""
    catalog_query = enriched_query
    max_price: Optional[float] = None
    reply_intro = "Here's what I found on Kapruka for you:"

    try:
        raw = await async_chat(
            system=SHOPPER_AGENT_PROMPT,
            messages=[{
                "role": "user",
                "content": (
                    f"USER PROFILE CONTEXT: {json.dumps(profile, ensure_ascii=False)}\n"
                    f"SHOPPING REQUEST: {enriched_query}"
                ),
            }],
            max_tokens=WORKER_MAX_TOKENS,
            model=ORCHESTRATOR_MODEL,
            json_mode=True,
            temperature=0.2,
        )
        doc = _extract_json(raw) or {}
        catalog_query = str(doc.get("catalog_query") or enriched_query).strip()
        if doc.get("max_price") is not None:
            try:
                max_price = float(doc["max_price"])
            except (TypeError, ValueError):
                max_price = None
        if doc.get("reply_intro"):
            reply_intro = str(doc["reply_intro"]).strip()
    except LLMUnavailableError as e:
        logger.warning("Shopper worker LLM unavailable, using raw query: %s", e)

    products: list[dict] = []
    try:
        from infrastructure.mcp.client import kapruka_search_products

        search_res = await kapruka_search_products(catalog_query, limit=8)
        products = _normalise_products(search_res)
    except Exception as e:
        logger.warning("Shopper worker catalog search failed: %s", e)

    if max_price is not None:
        def _price_of(p: dict) -> float:
            price = p.get("price")
            if isinstance(price, dict):
                price = price.get("amount")
            try:
                return float(str(price).replace(",", ""))
            except (TypeError, ValueError):
                return 0.0

        products = [p for p in products if _price_of(p) <= max_price] or products

    if products:
        reply = reply_intro
    else:
        reply = (
            f"I searched the live Kapruka catalog for “{catalog_query}” but couldn't "
            "find matching items right now — try rephrasing or narrowing the request?"
        )
    return reply, products


async def execute_logistics_worker(enriched_query: str, profile: dict) -> str:
    """Fulfillment & Logistics: extract destination/tracking, run the live check."""
    location: Optional[str] = None
    tracking_code: Optional[str] = None
    deadline: Optional[str] = None

    try:
        raw = await async_chat(
            system=LOGISTICS_AGENT_PROMPT,
            messages=[{
                "role": "user",
                "content": (
                    f"USER PROFILE CONTEXT: {json.dumps(profile, ensure_ascii=False)}\n"
                    f"LOGISTICS REQUEST: {enriched_query}"
                ),
            }],
            max_tokens=ROUTING_MAX_TOKENS,
            model=ORCHESTRATOR_MODEL,
            json_mode=True,
            temperature=0.1,
        )
        doc = _extract_json(raw) or {}
        location = doc.get("location") or None
        tracking_code = doc.get("tracking_code") or None
        deadline = doc.get("deadline") or None
    except LLMUnavailableError as e:
        logger.warning("Logistics worker LLM unavailable, passing raw query: %s", e)
        location = enriched_query

    # Delegate to the existing production logistics agent (MCP-backed).
    from agents import logistics_agent

    return await logistics_agent.run(
        location=location, deadline=deadline, tracking_code=tracking_code
    )


# ── Multimodal Computer Vision search ─────────────────────────────────────────

async def execute_multimodal_vision_search(
    image_bytes: bytes, mime_type: str = "image/jpeg"
) -> tuple[str, list[dict]]:
    """
    Parses visual characteristics via Vertex AI Gemini and runs an expanded
    matching sweep against the live Kapruka catalog.

    Returns (refined_query_string, matched_products).
    Raises HTTPException(502) when the vision model fails — per project policy
    we never poison the UX with mocked results on a real API error.
    """
    image_part = types.Part.from_bytes(data=image_bytes, mime_type=mime_type)

    analysis_prompt = (
        "Analyze this user product photo. Extract core e-commerce descriptive features: "
        "Product Category, Dominant Material/Texture, Explicit Colors, Pattern details, and Styling. "
        "Output ONLY a clean search keyword string combining the primary characteristics for catalog matching."
    )

    def _analyse() -> str:
        client = get_vertex_client()
        response = client.models.generate_content(
            model=VISION_MODEL,
            contents=[image_part, analysis_prompt],
            config=types.GenerateContentConfig(
                max_output_tokens=256,
                temperature=0.1,
                # Timeout is in MILLISECONDS and must live on the config.
                http_options=types.HttpOptions(timeout=LLM_CALL_TIMEOUT_MS),
                # Keep reasoning tokens from eating the tiny keyword budget.
                thinking_config=types.ThinkingConfig(thinking_budget=0),
            ),
        )
        return (response.text or "").strip()

    try:
        refined_query_string = await asyncio.to_thread(_analyse)
    except Exception as e:
        logger.exception("Vision analysis failed: %s", e)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Image analysis is temporarily unavailable. Please try again.",
        )

    if not refined_query_string:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Couldn't extract product features from that image — try a clearer photo.",
        )

    logger.info("Refined visual query target: %s", refined_query_string)

    matched_products: list[dict] = []
    try:
        from infrastructure.mcp.client import kapruka_search_products

        search_res = await kapruka_search_products(refined_query_string, limit=8)
        matched_products = _normalise_products(search_res)

        # Expanded sweep: retry on the head keywords when the full string misses.
        if not matched_products:
            head = " ".join(refined_query_string.split()[:3])
            if head and head != refined_query_string:
                search_res = await kapruka_search_products(head, limit=8)
                matched_products = _normalise_products(search_res)
    except Exception as e:
        logger.warning("Catalog match for visual query failed: %s", e)

    return refined_query_string, matched_products


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/api/agent/chat")
async def process_orchestrator_turn(
    payload: AgentChatPayload,
    identity: Identity = Depends(optional_identity),
):
    """One structured multi-agent turn (blueprint Part 5 §4)."""
    message = payload.message.strip()
    if not message:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Message cannot be empty."
        )
    user_id = _effective_user_id(identity, payload.user_id)

    # 1. Fetch historical memory contexts
    from infrastructure.db.user_repo import (
        get_accumulated_context,
        save_accumulated_context,
    )

    user_profile = await get_accumulated_context(user_id)

    # 2. Update memory vectors based on the latest conversational turn
    updated_profile = await run_profile_agent_turn(message, user_profile)
    if updated_profile != user_profile:
        await save_accumulated_context(user_id, updated_profile)

    # 3. Primary intent classification
    decision = {"target_agent": "SHOPPER", "enriched_query": message}
    if not is_mock_mode():
        routing_prompt = f"""
Analyze the customer request and route it to the appropriate sub-agent system.
Available Routes:
- 'SHOPPER': To search groceries, consumer items, household necessities, or hardware.
- 'LOGISTICS': To verify order tracking codes, delivery deadlines, or parcel states.

User Attributes Profile: {json.dumps(updated_profile, ensure_ascii=False)}
User Chat Message: "{message}"

Return a single JSON block containing: {{"target_agent": "SHOPPER" | "LOGISTICS", "enriched_query": "string"}}
"""
        try:
            raw = await async_chat(
                system="You are a precise intent-routing classifier. Output JSON only.",
                messages=[{"role": "user", "content": routing_prompt}],
                max_tokens=ROUTING_MAX_TOKENS,
                model=ORCHESTRATOR_MODEL,
                json_mode=True,
                temperature=0.0,
            )
            doc = _extract_json(raw)
            if doc and doc.get("target_agent") in ("SHOPPER", "LOGISTICS"):
                decision = {
                    "target_agent": doc["target_agent"],
                    "enriched_query": str(doc.get("enriched_query") or message),
                }
        except LLMUnavailableError as e:
            logger.warning("Routing LLM unavailable — defaulting to SHOPPER: %s", e)

    logger.info("Orchestrator decision for '%s': %s", user_id, decision)

    # 4. Delegate to specialized worker agents
    products: list[dict] = []
    if decision["target_agent"] == "LOGISTICS":
        reply = await execute_logistics_worker(decision["enriched_query"], updated_profile)
    else:
        reply, products = await execute_shopper_worker(
            decision["enriched_query"], updated_profile
        )

    return {
        "reply": reply,
        "products": products,
        "target_agent": decision["target_agent"],
        "enriched_query": decision["enriched_query"],
        "context_state": updated_profile,
        "authenticated": identity.is_authenticated,
    }


@router.post("/api/vision/search")
async def vision_search_endpoint(
    image: UploadFile = File(...),
    identity: Identity = Depends(optional_identity),
):
    """Upload a product photo → Gemini feature extraction → catalog matches."""
    mime_type = (image.content_type or "image/jpeg").lower()
    if mime_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported image type '{mime_type}'. Use JPEG, PNG, WEBP or HEIC.",
        )

    image_bytes = await image.read()
    if not image_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Empty image upload."
        )
    if len(image_bytes) > MAX_IMAGE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Image exceeds the 8 MB limit.",
        )

    refined_query, products = await execute_multimodal_vision_search(
        image_bytes, mime_type
    )

    if products:
        reply = (
            f"I analysed your photo — it looks like **{refined_query}**. "
            "Here are the closest matches from the Kapruka catalog:"
        )
    else:
        reply = (
            f"I read your photo as “{refined_query}”, but couldn't find close matches "
            "in the catalog right now. Try a different angle or describe it in chat!"
        )

    return {
        "reply": reply,
        "refined_query": refined_query,
        "products": products,
        "authenticated": identity.is_authenticated,
    }


@router.get("/api/me/profile")
async def get_my_profile(identity: Identity = Depends(require_identity)):
    """The signed-in user's accumulated_context ledger."""
    from infrastructure.db.user_repo import get_profile_row

    row = await get_profile_row(identity.user_id)
    return row or {
        "clerk_id": identity.user_id,
        "accumulated_context": {},
        "last_updated": None,
    }


@router.get("/api/me/cart")
async def get_my_cart(identity: Identity = Depends(require_identity)):
    """The signed-in user's persisted cart items."""
    from infrastructure.db.user_repo import get_cart_items

    return {"items": await get_cart_items(identity.user_id)}


@router.put("/api/me/cart")
async def put_my_cart(
    payload: CartPutPayload,
    identity: Identity = Depends(require_identity),
):
    """Persist the signed-in user's cart JSONB (cross-device continuity)."""
    from infrastructure.db.user_repo import save_cart_items

    ok = await save_cart_items(identity.user_id, payload.items)
    if not ok:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Cart storage is temporarily unavailable.",
        )
    return {"status": "success", "item_count": len(payload.items)}
