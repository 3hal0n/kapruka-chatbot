import os
os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"

import json
import logging
import asyncio
import time
from typing import Dict, Any, Optional
from fastapi import FastAPI, HTTPException, status, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, Response
from pydantic import BaseModel
from contextlib import asynccontextmanager

from agents.router import Router
from agents.orchestrator import router as orchestrator_router
from infrastructure.auth.clerk_auth import Identity, optional_identity

# Setup logger
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("kapruka-fastapi")

# In-memory storage of Router instances by user_id to maintain session history
router_sessions: Dict[str, Router] = {}


import re

def parse_budget_limit(msg: str) -> Optional[float]:
    """Parse numeric budget limit from user message (English + Sinhala patterns)."""
    patterns = [
        # English: keyword immediately before number — "under 5000", "max 3,000", "up to 4500"
        r'(?:under|below|less\s+than|budget\s+of|max(?:imum)?|up\s+to)\s*(?:rs\.?|lkr)?\s*([\d,]+)',
        # Sinhala particle: "4500 aduwen / aadu / adu / aduwata / yathe / widin" (number precedes keyword)
        r'([\d,]+)\s*(?:rs\.?)?\s*(?:aduwen|aduwata|yathe|athare|widin|wenna\s+ona|aadu|adu(?:wen)?)',
        # Budget word with Sinhala particles between it and the number: "budget eka 4500"
        r'budget\s+(?:\w+\s+)?([\d,]+)',
    ]
    for pattern in patterns:
        match = re.search(pattern, msg, re.IGNORECASE)
        if match:
            num_str = match.group(1).replace(",", "")
            try:
                val = float(num_str)
                if val > 0:
                    return val
            except ValueError:
                pass
    return None


def get_router(user_id: str) -> Router:
    """Retrieve or initialize the Router instance for a given user_id."""
    clean_id = user_id.strip()
    if not clean_id:
        clean_id = "guest"
    if clean_id not in router_sessions:
        logger.info(f"Creating new Router session for user_id: {clean_id}")
        router_sessions[clean_id] = Router(customer_id=clean_id)
    return router_sessions[clean_id]


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Warmup MCP client
    logger.info("Starting lifespan warmup...")

    # Initialise the relational DB layer (gift profiles). Best-effort: a DB
    # failure must NOT prevent the chat/SSE service from starting.
    try:
        from infrastructure.db.database import init_db
        await init_db()
    except Exception as e:
        logger.warning(f"DB init skipped ({e}). Profile persistence disabled.")

    try:
        from infrastructure.mcp.client import kapruka_mcp

        # Initialize Kapruka MCP Client
        await kapruka_mcp.start()

        logger.info("Warmup complete and MCP client initialized. Ready to serve requests.")
    except Exception as e:
        logger.exception(f"Warmup failed: {e}")
    yield
    # Shutdown MCP client connection
    try:
        from infrastructure.mcp.client import kapruka_mcp
        await kapruka_mcp.stop()
        logger.info("MCP client connection stopped.")
    except Exception as e:
        logger.exception(f"Error during MCP client shutdown: {e}")
    # Dispose DB engine/pool
    try:
        from infrastructure.db.database import dispose_db
        await dispose_db()
    except Exception as e:
        logger.warning(f"Error disposing DB: {e}")
    # Dispose the Cloud TTS HTTP client
    try:
        from infrastructure.audio.tts import close_http_client
        await close_http_client()
    except Exception as e:
        logger.warning(f"Error closing TTS client: {e}")
    logger.info("Shutting down lifespan...")


app = FastAPI(
    title="Kapruka Gift Concierge API",
    description="Asynchronous backend API replacing the Streamlit UI.",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware config to allow easy frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Multi-agent orchestrator gateway: /api/agent/chat, /api/vision/search, /api/me/*
app.include_router(orchestrator_router)


class ChatRequest(BaseModel):
    user_id: str
    message: str
    recipient_context: Optional[Dict[str, Any]] = None
    budget: Optional[str] = None
    recipient: Optional[str] = None
    occasion: Optional[str] = None
    vibe_check: Optional[str] = None
    # When the user acts on a saved Occasion Vibe Calendar profile, the frontend
    # passes its DB id so the backend can short-circuit intent classification and
    # load the profile's allergen guardrails directly.
    profile_id: Optional[str] = None


# ── Gift Profile (Occasion Vibe Calendar) schemas ─────────────────────────────

from datetime import date as _date, datetime as _datetime


class GiftProfileCreate(BaseModel):
    user_id: str
    recipient_name: str
    occasion: str
    target_date: _date
    vibe_summary: Optional[str] = None
    allergies: list[str] = []


class GiftProfileOut(BaseModel):
    id: str
    user_id: str
    recipient_name: str
    occasion: str
    target_date: _date
    vibe_summary: Optional[str] = None
    allergies: list[str] = []
    created_at: Optional[_datetime] = None
    days_until: int


class GroupGiftItem(BaseModel):
    id: str
    name: str
    price: float
    quantity: int
    image_url: Optional[str] = None


class GroupGiftRequest(BaseModel):
    cart: list[GroupGiftItem]
    subtotal: float
    total: float
    currency: str = "LKR"


class ResetRequest(BaseModel):
    user_id: str


class OrderItem(BaseModel):
    id: str
    name: str
    price: float
    quantity: int
    image_url: Optional[str] = None


class OrderRequest(BaseModel):
    user_id: str
    cart: list[OrderItem]
    recipient_name: str
    delivery_address: str
    contact_number: str
    city: Optional[str] = "Colombo"
    gift_message: Optional[str] = None


@app.post("/api/chat")
async def chat_endpoint(request: ChatRequest, identity: Identity = Depends(optional_identity)):
    """
    Accepts user message and streams back assistant responses and structured metadata
    using Server-Sent Events (SSE).

    When a valid Clerk bearer token accompanies the request, the immutable
    clerk_id supersedes the body's guest user_id so sessions, gift profiles and
    the accumulated-context ledger all key off the authenticated identity.
    """
    if not request.message.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Message cannot be empty."
        )

    effective_user_id = identity.user_id if identity.is_authenticated else request.user_id
    router = get_router(effective_user_id)

    # ── User Profile JSONB update hook ────────────────────────────────────────
    # Fire-and-forget: the Persistent Context Profile Agent compares this turn
    # against the stored accumulated_context and upserts the user_profiles row.
    # Never blocks or fails the SSE stream.
    try:
        from agents.profile_agent import update_profile_for_user
        asyncio.create_task(
            update_profile_for_user(effective_user_id.strip() or "guest", request.message)
        )
    except Exception as e:
        logger.warning(f"Profile update hook not scheduled: {e}")

    # Extract budget limit
    budget_limit = parse_budget_limit(request.message)
    if budget_limit is None and request.budget:
        budget_limit = parse_budget_limit(request.budget)
        
    if budget_limit is not None:
        logger.info(f"Detected budget limit: Rs. {budget_limit}")

    # ── Load a saved gift profile if one is referenced ────────────────────────
    # Explicit (profile_id) takes priority; otherwise try an implicit match on a
    # recipient name in the message. Wrapped so a DB outage never blocks chat.
    gift_profile = None
    try:
        from infrastructure.db.database import DB_AVAILABLE
        if DB_AVAILABLE:
            from infrastructure.db.profiles_repo import (
                get_profile_by_id,
                find_profile_by_recipient,
            )
            if request.profile_id:
                gift_profile = await get_profile_by_id(request.profile_id)
            if gift_profile is None:
                gift_profile = await find_profile_by_recipient(
                    effective_user_id.strip() or "guest", request.message
                )
            if gift_profile is not None:
                gift_profile = gift_profile.to_dict()
                logger.info(
                    f"Short-circuit: loaded gift profile for "
                    f"'{gift_profile.get('recipient_name')}' "
                    f"(allergies={gift_profile.get('allergies')})"
                )
    except Exception as e:
        logger.warning(f"Gift-profile lookup skipped: {e}")

    async def sse_generator():
        start_time = time.time()
        try:
            async for chunk in router.route_stream(request.message, request.recipient_context, budget_limit=budget_limit, vibe_check=request.vibe_check, gift_profile=gift_profile):
                # 1. Classification event
                if isinstance(chunk, str) and chunk.startswith("<<CLASSIFICATION>>:"):
                    try:
                        raw_data = chunk.split("<<CLASSIFICATION>>:", 1)[1]
                        classification = json.loads(raw_data)
                        payload = {
                            "type": "[INTENT_BADGE]",
                            "intents": classification.get("intents", []),
                            "classification": classification
                        }
                        yield f"event: intent_badge\ndata: {json.dumps(payload)}\n\n"
                    except Exception as e:
                        logger.error(f"Failed parsing classification JSON: {e}")

                # 2. Product Carousel event
                elif isinstance(chunk, str) and chunk.startswith("<<PRODUCTS>>:"):
                    try:
                        raw_data = chunk.split("<<PRODUCTS>>:", 1)[1]
                        products = json.loads(raw_data)
                        payload = {
                            "type": "[PRODUCT_CAROUSEL_DATA]",
                            "products": products
                        }
                        yield f"event: product_carousel\ndata: {json.dumps(payload)}\n\n"
                    except Exception as e:
                        logger.error(f"Failed parsing products JSON: {e}")

                # 2.5. Cart Update event
                elif isinstance(chunk, str) and chunk.startswith("<<CART_UPDATE>>:"):
                    try:
                        raw_data = chunk.split("<<CART_UPDATE>>:", 1)[1]
                        cart_data = json.loads(raw_data)
                        payload = {
                            "type": "[CART_UPDATE]",
                            **cart_data
                        }
                        yield f"event: cart_update\ndata: {json.dumps(payload)}\n\n"
                    except Exception as e:
                        logger.error(f"Failed parsing cart update JSON: {e}")

                # 3. Preference Saving Status event
                elif chunk == "<<PREF_SAVING>>":
                    payload = {
                        "type": "STATUS",
                        "code": "PREF_SAVING",
                        "message": "Remembering preferences..."
                    }
                    yield f"event: status\ndata: {json.dumps(payload)}\n\n"

                # 4. Logistics Status event
                elif chunk == "<<LOGISTICS>>":
                    payload = {
                        "type": "STATUS",
                        "code": "LOGISTICS",
                        "message": "Checking delivery feasibility..."
                    }
                    yield f"event: status\ndata: {json.dumps(payload)}\n\n"

                # 5. Critic refinement Status event
                elif chunk == "<<CRITIC>>":
                    payload = {
                        "type": "STATUS",
                        "code": "CRITIC",
                        "message": "Refining recommendation based on your profile..."
                    }
                    yield f"event: status\ndata: {json.dumps(payload)}\n\n"

                # 6. Standard text chunk
                else:
                    payload = {
                        "type": "TEXT",
                        "text": chunk
                    }
                    yield f"event: text\ndata: {json.dumps(payload)}\n\n"

            # 7. End of stream stats event
            elapsed = time.time() - start_time
            payload = {
                "type": "LATENCY",
                "latency": round(elapsed, 2)
            }
            yield f"event: latency\ndata: {json.dumps(payload)}\n\n"

        except Exception as e:
            logger.exception(f"Error in sse_generator: {e}")
            yield f"event: error\ndata: {json.dumps({'message': 'Internal generator error'})}\n\n"

    return StreamingResponse(sse_generator(), media_type="text/event-stream")


@app.post("/api/reset")
async def reset_endpoint(request: ResetRequest):
    """
    Clears short-term memory (history) for the specified user_id.
    """
    clean_id = request.user_id.strip()
    if not clean_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User ID cannot be empty."
        )

    if clean_id in router_sessions:
        router = router_sessions[clean_id]
        if hasattr(router, "st_memory"):
            router.st_memory.reset_history()
            logger.info(f"Successfully cleared conversation history for user: {clean_id}")
            return {"status": "success", "message": f"Session memory cleared for user '{clean_id}'."}
        else:
            return {"status": "error", "message": "Short-term memory sub-system not available."}
    else:
        return {"status": "success", "message": f"No active session found for user '{clean_id}' to reset."}


@app.post("/api/profiles", response_model=GiftProfileOut, status_code=status.HTTP_201_CREATED)
async def create_profile_endpoint(payload: GiftProfileCreate):
    """Persist a new gift profile (Occasion Vibe Calendar timeline event)."""
    from infrastructure.db.database import DB_AVAILABLE
    from infrastructure.db.profiles_repo import create_profile, days_until

    if not DB_AVAILABLE:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Profile storage is temporarily unavailable.",
        )

    if not payload.recipient_name.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="recipient_name is required.",
        )

    try:
        profile = await create_profile(
            user_id=payload.user_id.strip() or "guest",
            recipient_name=payload.recipient_name.strip(),
            occasion=payload.occasion.strip(),
            target_date=payload.target_date,
            vibe_summary=payload.vibe_summary,
            allergies=payload.allergies,
        )
    except Exception as e:
        logger.exception(f"create_profile failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Could not save profile.",
        )

    if profile is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Could not save profile.",
        )

    data = profile.to_dict()
    return GiftProfileOut(**data, days_until=days_until(profile.target_date))


@app.get("/api/profiles/{user_id}", response_model=list[GiftProfileOut])
async def list_profiles_endpoint(user_id: str):
    """All saved timeline configurations for a session, soonest occasion first."""
    from infrastructure.db.database import DB_AVAILABLE
    from infrastructure.db.profiles_repo import get_profiles_for_user, days_until

    if not DB_AVAILABLE:
        # Degrade gracefully: empty timeline rather than a hard failure.
        return []

    try:
        profiles = await get_profiles_for_user(user_id.strip() or "guest")
    except Exception as e:
        logger.exception(f"list_profiles failed: {e}")
        return []

    return [
        GiftProfileOut(**p.to_dict(), days_until=days_until(p.target_date))
        for p in profiles
    ]


@app.get("/api/delivery")
async def delivery_fee_endpoint(city: str = "Colombo"):
    """
    Returns the delivery fee and shipping tier for a given Sri Lankan city
    by calling the live kapruka_check_delivery MCP tool.
    """
    try:
        from infrastructure.mcp.client import kapruka_check_delivery
        result = await kapruka_check_delivery(city)
        logger.info(f"Delivery check result for '{city}': {result}")

        # Parse MCP response — field names may vary
        fee_raw = (
            result.get("delivery_fee")
            or result.get("fee")
            or result.get("shipping_fee")
            or result.get("cost")
            or 350
        )
        try:
            fee = int(float(str(fee_raw).replace(",", "").strip()))
        except (ValueError, TypeError):
            fee = 350

        label = (
            result.get("delivery_type")
            or result.get("tier")
            or result.get("label")
            or "Standard Delivery"
        )
        return {"fee": fee, "label": label, "city": city, "available": True}

    except Exception as e:
        logger.warning(f"Delivery check failed for '{city}': {e}. Returning fallback.")
        return {"fee": 350, "label": "Standard Delivery", "city": city, "available": True}


@app.post("/api/order")
async def create_order_endpoint(request: OrderRequest):
    """
    Creates a Kapruka guest order for the first item in the cart using
    the live kapruka_create_order MCP tool.
    Returns a checkout URL or order reference.
    """
    if not request.cart:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cart cannot be empty."
        )

    try:
        from infrastructure.mcp.client import kapruka_create_order

        # Build full cart array for multi-item orders
        cart_payload = [
            {
                "product_id": item.id,
                "quantity": item.quantity,
                "name": item.name,
                "price": item.price,
            }
            for item in request.cart
        ]

        # Use first cart item as primary product_id for compatibility,
        # but pass the full cart array for multi-item checkout support
        first_item = request.cart[0]
        result = await kapruka_create_order(
            product_id=first_item.id,
            quantity=first_item.quantity,
            recipient_name=request.recipient_name,
            delivery_address=request.delivery_address,
            contact_number=request.contact_number,
            gift_message=request.gift_message,
            cart=cart_payload,
        )
        logger.info(f"kapruka_create_order result: {result}")

        # Parse checkout URL from MCP response — field names may vary.
        # IMPORTANT: only ever return a REAL link the MCP gave us. We never
        # fabricate a kapruka.com/checkout/... URL — those 404. When MCP returns
        # no link, checkout_url stays null and the frontend falls back to the
        # individual product-page links instead.
        checkout_url = (
            result.get("checkout_url")
            or result.get("payment_url")
            or result.get("url")
            or result.get("order_url")
            or result.get("payment_link")
            or result.get("cart_url")
        )
        order_id = (
            result.get("order_id")
            or result.get("order_number")
            or result.get("id")
        )

        return {
            "status": "success" if checkout_url else "no_link",
            "order_id": order_id,
            "checkout_url": checkout_url,  # may be null — frontend uses product links
            "message": (
                f"Order {order_id} created successfully."
                if checkout_url else
                "Order received — open any product's Kapruka page to complete payment."
            ),
        }

    except Exception as e:
        logger.exception(f"kapruka_create_order failed: {e}")
        # No fabricated links. Signal failure honestly; the frontend will guide
        # the user to the real product pages instead.
        return {
            "status": "error",
            "order_id": None,
            "checkout_url": None,
            "message": "Couldn't reach Kapruka checkout right now — tap a product's "
                       "“Buy on Kapruka” link to complete your purchase directly.",
        }


@app.post("/api/group-gift/create")
async def create_group_gift(request: GroupGiftRequest):
    """
    Serializes the current cart into a base64 group-gift token.
    Returns the opaque token; the frontend assembles the full shareable URL
    so the backend never needs to know its own public hostname.
    """
    import base64

    payload = {
        "cart": [item.model_dump() for item in request.cart],
        "subtotal": request.subtotal,
        "total": request.total,
        "currency": request.currency,
        "gift_id": f"GG-{int(time.time())}",
        "created_at": int(time.time()),
    }
    token = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode()

    return {
        "token": token,
        "gift_id": payload["gift_id"],
        "item_count": len(request.cart),
        "total": request.total,
    }


class TTSRequest(BaseModel):
    text: str


@app.post("/api/tts")
async def tts_endpoint(request: TTSRequest):
    """
    Synthesize Ruki's spoken reply with Google Cloud Text-to-Speech
    (female si-LK voice — native Sinhala + graceful English, billed to the
    project's Vertex ADC credentials).

    Returns raw MP3 bytes. On any synthesis failure responds 502 so the
    frontend falls back to browser-native speech instead of going silent.
    """
    if not request.text.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Text cannot be empty.",
        )

    from infrastructure.audio.tts import synthesize_speech, TTSUnavailableError

    try:
        audio = await synthesize_speech(request.text)
    except TTSUnavailableError as e:
        logger.warning(f"TTS synthesis unavailable: {e}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Speech synthesis is temporarily unavailable.",
        )

    return Response(
        content=audio,
        media_type="audio/mpeg",
        headers={"Cache-Control": "no-store"},
    )


@app.get("/health")
async def health_check():
    """Simple API health probe endpoint."""
    return {"status": "healthy", "service": "Kapruka Gift Concierge API"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
