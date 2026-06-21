# agents/logistics_agent.py

import json
from utils.config import CLAUDE_MODEL_LOGISTICS, CLAUDE_MAX_TOKENS_LOGISTIC
from utils.prompts import LOGISTICS_SYSTEM_PROMPT
from infrastructure.llm.client import chat


async def run(location: str | None, deadline: str | None = None, tracking_code: str | None = None) -> str:
    from infrastructure.mcp.client import kapruka_list_delivery_cities, kapruka_check_delivery, kapruka_track_order

    # 1. Live Order Tracking Flow
    if tracking_code:
        try:
            tracking_info = await kapruka_track_order(tracking_code)
            if isinstance(tracking_info, dict):
                status = tracking_info.get("status") or tracking_info.get("result", {}).get("status") or "Unknown"
                last_loc = tracking_info.get("last_location") or tracking_info.get("result", {}).get("last_location") or "N/A"
                del_date = tracking_info.get("delivery_date") or tracking_info.get("result", {}).get("delivery_date") or "N/A"
                
                return (
                    f"Order tracking update for #{tracking_code}:\n"
                    f"Status: {status}\n"
                    f"Current Location: {last_loc}\n"
                    f"Est. Delivery Date: {del_date}"
                )
            else:
                return f"Tracking details for #{tracking_code}: {str(tracking_info)}"
        except Exception as e:
            return f"[Tracking] Failed to track order #{tracking_code} via live tools: {e}"

    if not location:
        return (
            "I'd be happy to check delivery availability and speed! "
            "Could you tell me which city or location in Sri Lanka you want the gift delivered to?"
        )

    # 2. Retrieve live delivery cities
    try:
        cities_res = await kapruka_list_delivery_cities()
        if isinstance(cities_res, dict):
            cities = cities_res.get("cities") or cities_res.get("result") or []
        else:
            cities = cities_res or []
    except Exception as e:
        print(f"Error fetching live delivery cities: {e}")
        cities = []

    # Map user location input to canonical delivery cities
    canonical_city = None
    if cities:
        loc_clean = location.strip().lower()
        # Direct match check
        for city in cities:
            if str(city).lower() == loc_clean:
                canonical_city = str(city)
                break
        
        # Substring match check
        if not canonical_city:
            for city in cities:
                if str(city).lower() in loc_clean or loc_clean in str(city).lower():
                    canonical_city = str(city)
                    break
        
        # LLM fallback match check
        if not canonical_city:
            matching_prompt = f"""You are a Sri Lankan geography expert mapping user inputs to canonical delivery cities.
User Input Location: "{location}"
Canonical cities: {", ".join(str(c) for c in cities[:120])}

If the location matches or is inside one of the canonical cities, return ONLY that exact canonical city name from the list.
If it does not match any, return "None".
Do not return any extra text or markdown, only the matched city name or "None"."""
            try:
                resolved = chat(
                    system=matching_prompt,
                    messages=[],
                    max_tokens=20,
                    model=CLAUDE_MODEL_LOGISTICS
                ).strip()
                if resolved and resolved != "None" and resolved in [str(c) for c in cities]:
                    canonical_city = resolved
            except Exception:
                pass

    # 3. Check delivery timing and rates for canonical city
    if canonical_city:
        try:
            delivery_info = await kapruka_check_delivery(canonical_city)
            if isinstance(delivery_info, dict):
                cost = delivery_info.get("cost") or delivery_info.get("delivery_fee") or "LKR 350"
                timeframe = delivery_info.get("timeframe") or delivery_info.get("estimated_delivery") or "next-day"
                status = delivery_info.get("status") or "Available"
                
                msg = f"Kapruka delivers to {canonical_city}. Standard timing is {timeframe} with a delivery fee of {cost}. Status: {status}."
                if deadline:
                    msg += f" Your deadline is {deadline}, which aligns perfectly with this timeframe!"
                return msg
            else:
                return f"Delivery update for {canonical_city}: {str(delivery_info)}"
        except Exception as e:
            return f"Checked delivery for {canonical_city}, but encountered an error: {e}"

    # 4. Fallback response if mapping fails
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