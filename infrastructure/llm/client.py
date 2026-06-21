"""
infrastructure/llm/client.py

Centralised LLM access via OpenRouter (OpenAI-compatible API).
All agents call `chat()` — never import the openai SDK directly.
"""

import os
import json
import time
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

_client: OpenAI | None = None


def is_mock_mode() -> bool:
    api_key = os.getenv("OPENROUTER_API_KEY")
    return not api_key or api_key == "your_openrouter_api_key"


def _get_client() -> OpenAI:
    global _client
    if _client is not None:
        return _client

    api_key = os.getenv("OPENROUTER_API_KEY")
    if not api_key or api_key == "your_openrouter_api_key":
        raise RuntimeError("OPENROUTER_API_KEY is not set in .env")

    _client = OpenAI(
        base_url="https://openrouter.ai/api/v1",
        api_key=api_key,
    )
    return _client


def chat(system: str, messages: list[dict], max_tokens: int, model: str, json_mode: bool = False) -> str:
    """
    Send a chat request to OpenRouter and return the response text, or mock it offline.
    """
    if is_mock_mode():
        msg_text = messages[-1]["content"] if messages else ""
        
        # 1. Router Intent Classifier Mock
        if "classify" in system.lower() or "intent" in system.lower():
            if "colombo" in msg_text.lower() or "delivery" in msg_text.lower() or "track" in msg_text.lower() or "deliver" in msg_text.lower():
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
            else:
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
        elif "critic" in system.lower() or "auditor" in system.lower():
            return json.dumps({
                "approved": True,
                "issues": [],
                "suggestion": None
            })
            
        # 3. Logistics Concierge Mock
        elif "logistics" in system.lower():
            return "Yes, Kapruka delivers to Colombo! Standard timing is next-day with a delivery fee of LKR 350."
            
        # 4. Catalog / General Concierge Mock
        else:
            return "Aney sure, puluwan machan! For your wife, I highly recommend the Heavenly Chocolate Fudge Cake (LKR 4650). It's in stock and ready to go! To get the secure guest checkout link, please tell me:\n1. Recipient's Name\n2. Complete Delivery Address\n3. Recipient's Phone Number\n4. Greeting Card Message\nThen we can place the order right away!"

    client = _get_client()
    full_messages = [{"role": "system", "content": system}] + messages

    kwargs = {
        "model": model,
        "max_tokens": max_tokens,
        "messages": full_messages,
    }
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}

    response = client.chat.completions.create(**kwargs)
    return response.choices[0].message.content.strip()


def chat_stream(system: str, messages: list[dict], max_tokens: int, model: str):
    """
    Same as chat() but yields text chunks as they arrive.
    """
    if is_mock_mode():
        text_resp = "Aney sure, puluwan machan! For your wife, I highly recommend the Heavenly Chocolate Fudge Cake (LKR 4650). It's in stock and ready to go! To get the secure guest checkout link, please tell me:\n1. Recipient's Name\n2. Complete Delivery Address\n3. Recipient's Phone Number\n4. Greeting Card Message\nThen we can place the order right away!"
        for chunk in text_resp.split(" "):
            yield chunk + " "
            time.sleep(0.02)
        return

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