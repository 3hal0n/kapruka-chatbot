"""
infrastructure/llm/vertex.py

Vertex AI (google-genai) client factory for the zero-trust production path.

Priority order:
1. Vertex AI Express Mode — GOOGLE_GENAI_USE_VERTEXAI=true AND a GEMINI_API_KEY
   is present. Routes through the Vertex endpoint using the same API key (no
   ADC/service account required). Keys minted from a Vertex-linked AI Studio
   project (format "AQ.xxx...") only work with vertexai=True set explicitly —
   this is the path used by the current deployment.
2. Vertex AI with Application Default Credentials (ADC) — GOOGLE_GENAI_USE_VERTEXAI=true
   with NO GEMINI_API_KEY. On a GCE VM this picks up the instance service
   account automatically; locally it requires `gcloud auth application-default login`.
3. Fallback: the existing AI-Studio API-key client from infrastructure.llm.client
   so deployments without Vertex enabled keep working unchanged.

NOTE: per project convention we NEVER silently mock on a real credential error —
callers get a raised exception and must degrade gracefully themselves.
"""

import os
import sys
import logging
from typing import Optional

import httpx
from google import genai
from google.genai import types

logger = logging.getLogger("kapruka-vertex")

_vertex_client: Optional[genai.Client] = None


def vertex_enabled() -> bool:
    """True when the deployment opts into Vertex AI ADC auth."""
    flag = os.getenv("GOOGLE_GENAI_USE_VERTEXAI", "").strip().lower()
    if flag in ("1", "true", "yes"):
        return True
    # Implicit opt-in: a project id present but no AI-Studio key.
    return bool(os.getenv("GCP_PROJECT_ID")) and not os.getenv("GEMINI_API_KEY")


def get_vertex_client() -> genai.Client:
    """Initializes a zero-trust production client leveraging VM metadata credentials.

    Cached module-wide — genai.Client is thread-safe and cheap to reuse.
    Raises on misconfiguration; callers must NOT swallow this into mock output.
    """
    global _vertex_client
    if _vertex_client is not None:
        return _vertex_client

    client_kwargs: dict = {}
    # Same Windows IPv4 pin as infrastructure/llm/client.py — dual-stack connect
    # stalls ~20s on win32; Linux containers are unaffected.
    if sys.platform == "win32":
        client_kwargs["http_options"] = types.HttpOptions(
            client_args={"transport": httpx.HTTPTransport(local_address="0.0.0.0")},
            async_client_args={"transport": httpx.AsyncHTTPTransport(local_address="0.0.0.0")},
        )

    api_key = os.environ.get("GEMINI_API_KEY", "")
    has_key = bool(api_key) and api_key != "your_gemini_api_key"

    if vertex_enabled() and has_key:
        # Express Mode: same API key, but vertexai=True routes through Vertex.
        _vertex_client = genai.Client(vertexai=True, api_key=api_key, **client_kwargs)
        logger.info("Vertex AI client initialised (Express Mode, API key).")
        return _vertex_client

    if vertex_enabled():
        # No API key at all — fall back to pure ADC (GCE service account / gcloud).
        _vertex_client = genai.Client(
            vertexai=True,
            project=os.environ.get("GCP_PROJECT_ID", "kapruka-chatbot"),
            location=os.environ.get("GCP_LOCATION", "us-central1"),
            **client_kwargs,
        )
        logger.info(
            "Vertex AI client initialised (project=%s, location=%s, ADC).",
            os.environ.get("GCP_PROJECT_ID", "kapruka-chatbot"),
            os.environ.get("GCP_LOCATION", "us-central1"),
        )
        return _vertex_client

    # Fallback: reuse the AI-Studio key client so existing deployments still work.
    from infrastructure.llm.client import _get_client

    logger.info("Vertex disabled — falling back to AI-Studio API-key client.")
    _vertex_client = _get_client()
    return _vertex_client
