"""
infrastructure/llm/client.py

Centralised LLM access via the official Google GenAI async SDK.
All agents call `chat()` or `chat_stream()` — never import the google-genai SDK directly.
"""

import os
import sys
import json
import asyncio
import logging
from typing import Generator, AsyncGenerator

import httpx
from google import genai
from google.genai import types
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("kapruka-llm-client")

# ── Default model ─────────────────────────────────────────────────────────────
DEFAULT_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

# ── Per-call timeouts (seconds) ───────────────────────────────────────────────
# Gemini 2.5 Flash can take well over 8s on a cold start, in JSON mode, or with a
# large system prompt. The previous hard 8.0s timeout caused real calls to fail and
# silently fall back to canned mock responses (the "please share your details" text).
# These are generous enough to let the real call complete.
JSON_TIMEOUT = float(os.getenv("LLM_JSON_TIMEOUT", "20.0"))      # router classification
STREAM_TIMEOUT = float(os.getenv("LLM_STREAM_TIMEOUT", "30.0"))  # catalog / revise streaming


class LLMUnavailableError(RuntimeError):
    """Raised when a real Gemini call fails (key present but request errored).

    Distinct from mock-mode: callers should handle this with their own graceful
    fallback (safe-default classification / in-character retry line) rather than
    the misleading detail-demanding mock payload.
    """


def _has_api_key() -> bool:
    api_key = os.getenv("GEMINI_API_KEY", "")
    return bool(api_key) and api_key != "your_gemini_api_key"


def _use_vertex() -> bool:
    """True when GOOGLE_GENAI_USE_VERTEXAI opts into routing through Vertex AI.

    Two sub-modes, both handled in _get_client():
    - Express Mode: GEMINI_API_KEY present — same key, but vertexai=True routes
      through the Vertex endpoint so usage bills to GCP_PROJECT_ID's billing
      account instead of a standalone AI-Studio quota.
    - ADC (service account): no GEMINI_API_KEY — authenticates via
      GOOGLE_APPLICATION_CREDENTIALS (a downloaded service-account JSON key) or
      the ambient gcloud/GCE credential, billed to GCP_PROJECT_ID.
    """
    return os.getenv("GOOGLE_GENAI_USE_VERTEXAI", "").strip().lower() in ("1", "true", "yes")


def is_mock_mode() -> bool:
    """Mock only when there's truly no way to reach a real model.

    A configured API key is always "real". Absent a key, Vertex ADC counts as
    real too — if the ADC credential turns out to be missing/invalid, the
    actual API call fails and raises LLMUnavailableError (never silently mocked).
    """
    if _has_api_key():
        return False
    return not _use_vertex()


_client_instance = None

def _get_client() -> genai.Client:
    """Return a configured async-capable Google GenAI client.

    Auth priority:
    1. Vertex Express Mode  — GOOGLE_GENAI_USE_VERTEXAI=true + GEMINI_API_KEY.
    2. Vertex ADC           — GOOGLE_GENAI_USE_VERTEXAI=true, no key; uses
                              GOOGLE_APPLICATION_CREDENTIALS (service-account
                              JSON) or ambient gcloud/GCE credentials, billed
                              to GCP_PROJECT_ID.
    3. Plain AI-Studio key  — GOOGLE_GENAI_USE_VERTEXAI unset/false + GEMINI_API_KEY.
    """
    global _client_instance
    if _client_instance is None:
        client_kwargs: dict = {}

        if _use_vertex() and _has_api_key():
            client_kwargs["vertexai"] = True
            client_kwargs["api_key"] = os.environ["GEMINI_API_KEY"]
        elif _use_vertex():
            client_kwargs["vertexai"] = True
            client_kwargs["project"] = os.environ.get("GCP_PROJECT_ID", "kapruka-chatbot")
            client_kwargs["location"] = os.environ.get("GCP_LOCATION", "us-central1")
        elif _has_api_key():
            client_kwargs["api_key"] = os.environ["GEMINI_API_KEY"]
        else:
            raise RuntimeError(
                "No Gemini credentials configured — set GEMINI_API_KEY, or set "
                "GOOGLE_GENAI_USE_VERTEXAI=true with GOOGLE_APPLICATION_CREDENTIALS "
                "pointing to a service-account JSON key."
            )

        # On Windows, httpx's default dual-stack connect stalls ~20s on the
        # endpoint's IPv6 address before falling back to IPv4, and the SDK's
        # internal retries stack that into a 40s+ hang — even though `curl` and
        # the configured http_options.timeout are unaffected. Binding the httpx
        # transport to an IPv4 source address forces IPv4 and drops each call
        # from ~40s (hang) to ~1s. Linux/containers (the deploy target) don't
        # hit this, so we only apply it on win32 to leave the VM path untouched.
        if sys.platform == "win32":
            client_kwargs["http_options"] = types.HttpOptions(
                client_args={"transport": httpx.HTTPTransport(local_address="0.0.0.0")},
                async_client_args={"transport": httpx.AsyncHTTPTransport(local_address="0.0.0.0")},
            )

        _client_instance = genai.Client(**client_kwargs)
    return _client_instance


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
    temperature: float = 0.7,
) -> str:
    """
    Send a single-turn (or multi-turn) chat request to Gemini and return the
    full response text.

    Falls back to deterministic mock payloads ONLY when GEMINI_API_KEY is not
    configured (genuine offline dev). When a key IS present but the real call
    fails, raises LLMUnavailableError so the caller can apply its own graceful
    fallback — we never surface the misleading canned mock on a transient error.
    """
    if is_mock_mode():
        return _mock_response(system, messages, json_mode)

    try:
        client = _get_client()
        contents = _build_contents(system, messages)

        config = types.GenerateContentConfig(
            system_instruction=system,
            max_output_tokens=max_tokens,
            temperature=temperature,
            response_mime_type="application/json" if json_mode else "text/plain",
            # http_options.timeout is in MILLISECONDS and belongs on the config in
            # google-genai 1.x (passing it to generate_content() raises TypeError).
            http_options=types.HttpOptions(timeout=int(JSON_TIMEOUT * 1000)),
            # Disable Gemini 2.5 Flash "thinking" — otherwise reasoning tokens eat
            # the max_output_tokens budget and truncate the visible reply. We want
            # fast, direct concierge answers, not chain-of-thought.
            thinking_config=types.ThinkingConfig(thinking_budget=0),
        )

        response = client.models.generate_content(
            model=model,
            contents=contents,
            config=config,
        )
        return response.text.strip()

    except Exception as e:
        logger.exception(f"Gemini chat() failed: {e}")
        raise LLMUnavailableError(str(e)) from e


# ── Synchronous streaming chat_stream() ───────────────────────────────────────

def chat_stream(
    system: str,
    messages: list[dict],
    max_tokens: int,
    model: str = DEFAULT_MODEL,
    temperature: float = 0.7,
) -> Generator[str, None, None]:
    """
    Same as chat() but yields text delta chunks as they arrive from Gemini's
    streaming API.

    Falls back to a word-by-word mock ONLY in offline dev (no API key). When a
    key is present but the real call fails, yields a single short, in-character
    retry line instead of the misleading detail-demanding mock.
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
            temperature=temperature,
            # See chat(): timeout (ms) must live on the config in google-genai 1.x.
            http_options=types.HttpOptions(timeout=int(STREAM_TIMEOUT * 1000)),
            # Disable "thinking" so reasoning tokens don't consume the reply budget.
            thinking_config=types.ThinkingConfig(thinking_budget=0),
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
        yield "Aiyo, mata podi pressure ekak 😅 — give me one sec and try that again?"


# ── Text embeddings (Gemini) ──────────────────────────────────────────────────
# Replaces the local sentence-transformers/PyTorch encoder so the slim container
# doesn't pull heavy CUDA tensors. Vectors come from the hosted Gemini embedding
# model instead — no local tensor computing required.

DEFAULT_EMBED_MODEL = os.getenv("GEMINI_EMBED_MODEL", "gemini-embedding-001")


def embed_texts(
    texts: list[str],
    model: str = DEFAULT_EMBED_MODEL,
    output_dim: int | None = None,
) -> list[list[float]]:
    """Embed a batch of strings into vectors using the hosted Gemini model.

    `output_dim` truncates the Matryoshka embedding to a fixed size so it matches
    the Qdrant collection's configured vector dimension. Raises if the API is
    unavailable so callers (ingest / semantic search) fail loudly rather than
    silently storing bad vectors.
    """
    if not texts:
        return []
    if is_mock_mode():
        raise RuntimeError("Embeddings unavailable: GEMINI_API_KEY is not set.")

    client = _get_client()
    config = None
    if output_dim:
        config = types.EmbedContentConfig(output_dimensionality=output_dim)

    response = client.models.embed_content(model=model, contents=texts, config=config)
    return [list(e.values) for e in response.embeddings]


def embed_text(
    text: str,
    model: str = DEFAULT_EMBED_MODEL,
    output_dim: int | None = None,
) -> list[float]:
    """Embed a single string. Convenience wrapper around embed_texts()."""
    vectors = embed_texts([text], model=model, output_dim=output_dim)
    return vectors[0] if vectors else []


# ── Async chat coroutine (for use inside async FastAPI/router contexts) ────────

async def async_chat(
    system: str,
    messages: list[dict],
    max_tokens: int,
    model: str = DEFAULT_MODEL,
    json_mode: bool = False,
    temperature: float = 0.7,
) -> str:
    """
    Async wrapper around chat() so async callers don't block the event loop.
    Uses asyncio.to_thread to offload the synchronous Gemini SDK call.
    """
    return await asyncio.to_thread(chat, system, messages, max_tokens, model, json_mode, temperature)


# ── Mock response helpers ─────────────────────────────────────────────────────

def _mock_response(system: str, messages: list[dict], json_mode: bool) -> str:
    """Return deterministic mock payloads that mirror real Gemini responses."""
    msg_text = messages[-1].get("content", "") if messages else ""
    msg_lower = msg_text.lower()

    # 1. Router Intent Classifier Mock
    if "classify" in system.lower() or "intent" in system.lower():
        search_query = None
        search_recipient = None
        intents = ["SEARCH"]
        
        # Simple extraction rules for queries
        if "cake" in msg_lower:
            search_query = "cake"
        elif "chocolate" in msg_lower:
            search_query = "chocolate"
        elif "toy" in msg_lower:
            search_query = "toy"
        elif "flower" in msg_lower or "bouquet" in msg_lower:
            search_query = "flowers"
        else:
            search_query = "gift"
            
        if "wife" in msg_lower:
            search_recipient = "wife"
        elif "husband" in msg_lower:
            search_recipient = "husband"
        elif "boy" in msg_lower:
            search_recipient = "boy"
        elif "girl" in msg_lower:
            search_recipient = "girl"
            
        if any(kw in msg_lower for kw in ["colombo", "delivery", "track", "deliver", "kandy", "shipping"]):
            intents.append("LOGISTICS")
            
        return json.dumps({
            "intents": intents,
            "allergies": {},
            "preferences": {},
            "search_recipient": search_recipient,
            "location": "Colombo" if "colombo" in msg_lower else ("Kandy" if "kandy" in msg_lower else None),
            "deadline": None,
            "search_query": search_query,
            "tracking_code": None,
            "cart_items": None,
            "trigger_checkout": False,
            "recipient_name": None,
            "delivery_address": None,
            "contact_number": None
        })

    # 2. Critic Auditor Mock (Only for JSON mode validation checks)
    if json_mode and ("critic" in system.lower() or "auditor" in system.lower()):
        return json.dumps({"approved": True, "issues": [], "suggestion": None})

    # 3. Logistics Concierge Mock
    if "logistics" in system.lower():
        return "Yes, Kapruka delivers next-day! Standard shipping to Colombo is LKR 350."

    # 4. Catalog / General Concierge Mock (Or fallback for failed text calls)
    search_q = "gift"
    if "cake" in msg_lower:
        search_q = "cake"
    elif "chocolate" in msg_lower:
        search_q = "chocolate"
    elif "toy" in msg_lower:
        search_q = "toy"
    return (
        f"Aney sure, puluwan machan! For your {search_q}, I checked the live Kapruka catalog "
        "and pulled a few lovely picks below. Tap any product's “Buy on Kapruka” link to grab it. "
        "Who's this gift for? \U0001F381"
    )


def _mock_stream(system: str, messages: list[dict]) -> Generator[str, None, None]:
    """Word-by-word mock stream for offline development."""
    import time
    response = _mock_response(system, messages, json_mode=False)
    for word in response.split(" "):
        yield word + " "
        time.sleep(0.015)