import os
os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"

import json
import logging
import asyncio
import time
from typing import Dict, Any, Optional
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from contextlib import asynccontextmanager

from agents.router import Router

# Setup logger
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("kapruka-fastapi")

# In-memory storage of Router instances by user_id to maintain session history
router_sessions: Dict[str, Router] = {}


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


class ChatRequest(BaseModel):
    user_id: str
    message: str
    recipient_context: Optional[Dict[str, Any]] = None


class ResetRequest(BaseModel):
    user_id: str


@app.post("/api/chat")
async def chat_endpoint(request: ChatRequest):
    """
    Accepts user message and streams back assistant responses and structured metadata
    using Server-Sent Events (SSE).
    """
    if not request.message.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Message cannot be empty."
        )

    router = get_router(request.user_id)

    async def sse_generator():
        start_time = time.time()
        try:
            async for chunk in router.route_stream(request.message, request.recipient_context):
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


@app.get("/health")
async def health_check():
    """Simple API health probe endpoint."""
    return {"status": "healthy", "service": "Kapruka Gift Concierge API"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
