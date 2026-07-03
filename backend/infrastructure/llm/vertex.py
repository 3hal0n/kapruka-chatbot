"""
infrastructure/llm/vertex.py

Thin re-export so vision search (agents/orchestrator.py) shares the exact same
client construction as the rest of the app. All auth-mode logic (Express Mode
API key / ADC service account / plain AI-Studio key) lives in one place —
infrastructure.llm.client._get_client() — to avoid two factories drifting out
of sync on which credentials route where.

NOTE: per project convention we NEVER silently mock on a real credential error —
callers get a raised exception and must degrade gracefully themselves.
"""

from google.genai import Client

from infrastructure.llm.client import _get_client


def get_vertex_client() -> Client:
    """Return the shared, lazily-initialised Google GenAI client."""
    return _get_client()
