"""
infrastructure/llm/client.py

Centralised LLM access via OpenRouter (OpenAI-compatible API).
All agents call `chat()` — never import the openai SDK directly.
"""

import os
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

_client: OpenAI | None = None


def _get_client() -> OpenAI:
    global _client
    if _client is not None:
        return _client

    api_key = os.getenv("OPENROUTER_API_KEY")
    if not api_key:
        raise RuntimeError("OPENROUTER_API_KEY is not set in .env")

    _client = OpenAI(
        base_url="https://openrouter.ai/api/v1",
        api_key=api_key,
    )
    return _client


def chat(system: str, messages: list[dict], max_tokens: int, model: str, json_mode: bool = False) -> str:
    """
    Send a chat request to OpenRouter and return the response text.

    Args:
        system:     System prompt string.
        messages:   List of {"role": ..., "content": ...} dicts (no system message).
        max_tokens: Maximum tokens for the response.
        model:      Model identifier (e.g. "anthropic/claude-sonnet-4-5").

    Returns:
        The assistant's reply as a plain string.
    """
    client = _get_client()

    full_messages = [{"role": "system", "content": system}] + messages

    kwargs = {
        "model": model,
        "max_tokens": max_tokens,
        "messages": full_messages,
    }
    if json_mode: #Ensure json mode in API level
        kwargs["response_format"] = {"type": "json_object"}

    response = client.chat.completions.create(**kwargs)

    return response.choices[0].message.content.strip()

def chat_stream(system: str, messages: list[dict], max_tokens: int, model: str):
    """
    Same as chat() but yields text chunks as they arrive.
    Use for final user-facing responses only.
    """
    client = _get_client()
    full_messages = [{"role": "system", "content": system}] + messages

    with client.chat.completions.create(
        model=model,
        max_tokens=max_tokens,
        messages=full_messages,
        stream=True,
    ) as stream:
        for chunk in stream:
            delta = chunk.choices[0].delta.content
            if delta:
                yield delta