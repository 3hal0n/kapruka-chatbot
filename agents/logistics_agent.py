# agents/logistics_agent.py

from utils.config import CLAUDE_MODEL_LOGISTICS, CLAUDE_MAX_TOKENS_LOGISTIC
from utils.prompts import LOGISTICS_SYSTEM_PROMPT
from infrastructure.llm.client import chat

# Kapruka delivery coverage for Sri Lankan districts
# tier 1 = next-day, tier 2 = 2-3 days, tier 3 = 3-5 days
DISTRICT_COVERAGE = {
    # Western Province
    "colombo":       {"covered": True,  "tier": 1, "label": "Colombo"},
    "gampaha":       {"covered": True,  "tier": 1, "label": "Gampaha"},
    "kalutara":      {"covered": True,  "tier": 1, "label": "Kalutara"},
    # Central Province
    "kandy":         {"covered": True,  "tier": 2, "label": "Kandy"},
    "matale":        {"covered": True,  "tier": 2, "label": "Matale"},
    "nuwara eliya":  {"covered": True,  "tier": 2, "label": "Nuwara Eliya"},
    # Southern Province
    "galle":         {"covered": True,  "tier": 2, "label": "Galle"},
    "matara":        {"covered": True,  "tier": 2, "label": "Matara"},
    "hambantota":    {"covered": True,  "tier": 3, "label": "Hambantota"},
    # Northern Province
    "jaffna":        {"covered": True,  "tier": 3, "label": "Jaffna"},
    "kilinochchi":   {"covered": False, "tier": None, "label": "Kilinochchi"},
    "mannar":        {"covered": False, "tier": None, "label": "Mannar"},
    "vavuniya":      {"covered": True,  "tier": 3, "label": "Vavuniya"},
    "mullaitivu":    {"covered": False, "tier": None, "label": "Mullaitivu"},
    # Eastern Province
    "trincomalee":   {"covered": True,  "tier": 3, "label": "Trincomalee"},
    "batticaloa":    {"covered": True,  "tier": 3, "label": "Batticaloa"},
    "ampara":        {"covered": True,  "tier": 3, "label": "Ampara"},
    # North Western Province
    "kurunegala":    {"covered": True,  "tier": 2, "label": "Kurunegala"},
    "puttalam":      {"covered": True,  "tier": 2, "label": "Puttalam"},
    # North Central Province
    "anuradhapura":  {"covered": True,  "tier": 2, "label": "Anuradhapura"},
    "polonnaruwa":   {"covered": True,  "tier": 3, "label": "Polonnaruwa"},
    # Uva Province
    "badulla":       {"covered": True,  "tier": 3, "label": "Badulla"},
    "monaragala":    {"covered": True,  "tier": 3, "label": "Monaragala"},
    # Sabaragamuwa Province
    "ratnapura":     {"covered": True,  "tier": 2, "label": "Ratnapura"},
    "kegalle":       {"covered": True,  "tier": 2, "label": "Kegalle"},
}

TIER_DESCRIPTION = {
    1: "next-day delivery",
    2: "2–3 day delivery",
    3: "3–5 day delivery",
}


def _lookup(location: str) -> dict:
    """Return coverage info for a location string, or None if not found."""
    key = location.strip().lower()
    return DISTRICT_COVERAGE.get(key)


def run(location: str | None, deadline: str | None = None, tracking_code: str | None = None) -> str:
    # Tracking flow — Playwright integration goes here
    if tracking_code:
        return f"[Tracking stub] Order {tracking_code} — Playwright lookup not yet implemented."
        # Browser automation where it goes and get the tracking information 
    


    if not location:
        return (
            "I'd be happy to check delivery for you! "
            "Could you let me know which district or city in Sri Lanka you'd like the gift delivered to?"
        )

    coverage = _lookup(location)

    # no LLM needed
    if coverage is not None:
        if not coverage["covered"]:
            return (
                f"Unfortunately, Kapruka doesn't currently deliver to {coverage['label']}. "
                "You may want to consider a nearby district or contact Kapruka directly for alternatives."
            )
        tier = coverage["tier"]
        speed = TIER_DESCRIPTION[tier]
        msg = f"Great news — Kapruka delivers to {coverage['label']} with {speed}."
        if deadline:
            msg += f" Your deadline is {deadline}, so that should work perfectly!"
        return msg

    # Case 1 — unknown location only, fall back to LLM
    context = (
        f"Location requested: {location}\n"
        f"Deadline: {deadline or 'not specified'}"
    )

    return chat(
        system=LOGISTICS_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": context}],
        max_tokens=CLAUDE_MAX_TOKENS_LOGISTIC,
        model=CLAUDE_MODEL_LOGISTICS,
    )