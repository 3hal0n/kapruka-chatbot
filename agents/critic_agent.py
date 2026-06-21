# agents/critic_agent.py

import json
import asyncio
from utils.config import CLAUDE_MODEL, CLAUDE_MAX_TOKENS_CRITIQUE
from utils.prompts import CRITIC_SYSTEM_PROMPT
from infrastructure.llm.client import chat
from pydantic import BaseModel

class CriticOutput(BaseModel): # pydantic model fro validation 
    approved : bool
    issues : list
    suggestion : str | None


async def critique(
    recommendation: str,
    search_query: str,
    profile: dict,
    recipients: set,
    products: list
) -> dict:

    product_lines = "\n".join([
        f"- {p.get('name')} | Price: {p.get('price')} | Stock: {p.get('availability') or p.get('stock')} | "
        f"Specs: {p.get('specs', 'N/A')} | Checkout Ready: {p.get('checkout_ready', True)}"
        for p in products
    ])

    allergies = profile.get("allergies", [])
    preferences = profile.get("preferences", [])
    location = profile.get("location", "unknown")

    context = f"""Recipients: { recipients or 'unknown'}
    Allergies: {str(allergies)}
    Preferences: {str(preferences)}
    Location: {location}
    

    Search query: {search_query}

    Available products:
    {product_lines}

    Recommendation to review:
    {recommendation}"""

    # Run blocking chat inside thread pool to prevent blocking event loop
    raw = await asyncio.to_thread(
        chat,
        system=CRITIC_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": context}],
        max_tokens=CLAUDE_MAX_TOKENS_CRITIQUE,
        model=CLAUDE_MODEL,
        json_mode=True,
    )
    clean = raw.strip()
    start = clean.find("{")
    end = clean.rfind("}") + 1
    if start != -1 and end > start:
        clean = clean[start:end]

    try:
        result = json.loads(clean)
        validated = CriticOutput(**result)
        return validated.model_dump()

    except (json.JSONDecodeError, Exception):
        return {"approved": False, "issues": ["Critic returned unparseable response — rejecting as precaution"], "suggestion": None}
