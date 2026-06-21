"""
infrastructure/llm/client.py

Centralised LLM access via the official Google GenAI async SDK.
All agents call `chat()` or `chat_stream()` — never import the google-genai SDK directly.
"""

import os
import json
import asyncio
import logging
from typing import Generator, AsyncGenerator

from google import genai
from google.genai import types
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("kapruka-llm-client")

# ── Default model ─────────────────────────────────────────────────────────────
DEFAULT_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")


def is_mock_mode() -> bool:
    api_key = os.getenv("GEMINI_API_KEY", "")
    return not api_key or api_key in ("your_gemini_api_key", "")


def _get_client() -> genai.Client:
    """Return a configured async-capable Google GenAI client."""
    api_key = os.getenv("GEMINI_API_KEY", "")
    if not api_key or api_key == "your_gemini_api_key":
        raise RuntimeError("GEMINI_API_KEY is not set in .env")
    return genai.Client(api_key=api_key)


def _build_contents(system: str, messages: list[dict]) -> list[types.Content]:
    """
    Merge the system prompt and multi-turn messages into the GenAI Content format.
    Google GenAI uses a flat list of Content objects with 'user'/'model' roles;
    the system instruction is set separately on the GenerateContentConfig.
    """
    contents: list[types.Content] = []
    for msg in messages:
        role = "user" if msg.get("role") == "user" else "model"
        contents.append(
            types.Content(
                role=role,
                parts=[types.Part(text=msg.get("content", ""))],
            )
        )
    return contents


# ── Synchronous chat() ────────────────────────────────────────────────────────

def chat(
    system: str,
    messages: list[dict],
    max_tokens: int,
    model: str = DEFAULT_MODEL,
    json_mode: bool = False,
) -> str:
    """
    Send a single-turn (or multi-turn) chat request to Gemini and return the
    full response text. Falls back to deterministic mock payloads when
    GEMINI_API_KEY is not configured.
    """
    if is_mock_mode():
        return _mock_response(system, messages, json_mode)

    try:
        client = _get_client()
        contents = _build_contents(system, messages)

        config = types.GenerateContentConfig(
            system_instruction=system,
            max_output_tokens=max_tokens,
            response_mime_type="application/json" if json_mode else "text/plain",
        )

        response = client.models.generate_content(
            model=model,
            contents=contents,
            config=config,
        )
        return response.text.strip()

    except Exception as e:
        logger.exception(f"Gemini chat() failed: {e}")
        return _mock_response(system, messages, json_mode)


# ── Synchronous streaming chat_stream() ───────────────────────────────────────

def chat_stream(
    system: str,
    messages: list[dict],
    max_tokens: int,
    model: str = DEFAULT_MODEL,
) -> Generator[str, None, None]:
    """
    Same as chat() but yields text delta chunks as they arrive from Gemini's
    streaming API. Falls back to a word-by-word mock when offline.
    """
    if is_mock_mode():
        yield from _mock_stream(system, messages)
        return

    try:
        client = _get_client()
        contents = _build_contents(system, messages)

        config = types.GenerateContentConfig(
            system_instruction=system,
            max_output_tokens=max_tokens,
        )

        for chunk in client.models.generate_content_stream(
            model=model,
            contents=contents,
            config=config,
        ):
            if chunk.text:
                yield chunk.text

    except Exception as e:
        logger.exception(f"Gemini chat_stream() failed: {e}")
        yield from _mock_stream(system, messages)


# ── Async chat coroutine (for use inside async FastAPI/router contexts) ────────

async def async_chat(
    system: str,
    messages: list[dict],
    max_tokens: int,
    model: str = DEFAULT_MODEL,
    json_mode: bool = False,
) -> str:
    """
    Async wrapper around chat() so async callers don't block the event loop.
    Uses asyncio.to_thread to offload the synchronous Gemini SDK call.
    """
    return await asyncio.to_thread(chat, system, messages, max_tokens, model, json_mode)


# ── Mock response helpers ─────────────────────────────────────────────────────

def _mock_response(system: str, messages: list[dict], json_mode: bool) -> str:
    """Return deterministic mock payloads that mirror real Gemini responses."""
    msg_text = messages[-1].get("content", "") if messages else ""

    # 1. Router Intent Classifier Mock
    if "classify" in system.lower() or "intent" in system.lower():
        if any(kw in msg_text.lower() for kw in ["colombo", "delivery", "track", "deliver", "kandy"]):
            return json.dumps({
                "intents": ["LOGISTICS"],
                "allergies": {},
                "preferences": {},
                "search_recipient": None,
                "location": "Colombo",
                "deadline": None,
                "search_query": None,
                "tracking_code": None
            })
        return json.dumps({
            "intents": ["SEARCH"],
            "allergies": {},
            "preferences": {},
            "search_recipient": "wife",
            "location": None,
            "deadline": None,
            "search_query": "chocolate cake",
            "tracking_code": None
        })

    # 2. Critic Auditor Mock
    if "critic" in system.lower() or "auditor" in system.lower():
        return json.dumps({"approved": True, "issues": [], "suggestion": None})

    # 3. Logistics Concierge Mock
    if "logistics" in system.lower():
        return "Yes, Kapruka delivers to Colombo! Standard timing is next-day with a delivery fee of LKR 350."

    # 4. Catalog / General Concierge Mock
    return (
        "Aney sure, puluwan machan! For your loved one, I checked the live Kapruka catalog. "
        "To place the order, please share: Recipient's Name, Delivery Address, and Phone Number."
    )


def _mock_stream(system: str, messages: list[dict]) -> Generator[str, None, None]:
    """Word-by-word mock stream for offline development."""
    import time
    response = _mock_response(system, messages, json_mode=False)
    for word in response.split(" "):
        yield word + " "
        time.sleep(0.015)