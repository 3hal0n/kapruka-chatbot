# agents/logistics_agent.py

import json
from utils.config import CLAUDE_MODEL_LOGISTICS, CLAUDE_MAX_TOKENS_LOGISTIC
from utils.prompts import LOGISTICS_SYSTEM_PROMPT
from infrastructure.llm.client import chat


async def run(location: str | None, deadline: str | None = None, tracking_code: str | None = None) -> str:
    from infrastructure.mcp.client import kapruka_list_delivery_cities, kapruka_check_delivery, kapruka_track_order

    # 1. Live Order Tracking Flow — visual status journey
    if tracking_code:
        try:
            tracking_info = await kapruka_track_order(tracking_code)
            if isinstance(tracking_info, dict):
                nested = tracking_info.get("result") if isinstance(tracking_info.get("result"), dict) else {}

                def field(*keys: str, default: str = "") -> str:
                    for k in keys:
                        v = tracking_info.get(k) or nested.get(k)
                        if v:
                            return str(v)
                    return default

                status = field("status", "state", "current_status", default="In transit")
                last_loc = field("last_location", "current_location", "location")
                del_date = field("delivery_date", "estimated_delivery", "eta", "arrival_date")
                provider = field("provider", "courier", "carrier")
                note = field("note", "notes", "remark", "message")

                # Map the raw status onto the canonical journey stages.
                stages = [
                    "Order placed",
                    "Packed at fulfilment centre",
                    "In transit",
                    "Out for delivery",
                    "Delivered",
                ]
                s = status.lower()
                if "out for" in s:
                    current = 3
                elif "deliver" in s:
                    current = 4
                elif any(k in s for k in ("transit", "ship", "dispatch", "customs", "on the way", "hub")):
                    current = 2
                elif any(k in s for k in ("pack", "process", "prepar")):
                    current = 1
                elif any(k in s for k in ("placed", "confirm", "received", "pending", "created")):
                    current = 0
                else:
                    current = 2  # unknown wording — assume mid-journey

                lines = [f"📦 Tracking #{tracking_code} — status journey", ""]
                for i, stage in enumerate(stages):
                    if i < current or (current == 4 and i < 4):
                        mark = "✅"
                    elif i == current:
                        mark = "🔵"
                    else:
                        mark = "⚪"
                    detail = ""
                    if i == current:
                        detail = f"  ·  {status}"
                        if last_loc and i in (2, 3):
                            detail += f" (near {last_loc})"
                    lines.append(f"{mark}  {stage}{detail}")

                footer = []
                if del_date:
                    footer.append(f"🗓️ Estimated delivery: {del_date}")
                if provider:
                    footer.append(f"🚚 Carrier: {provider}")
                if note:
                    footer.append(f"📝 {note}")
                if footer:
                    lines.append("")
                    lines.extend(footer)

                return "\n".join(lines)
            else:
                return f"Tracking details for #{tracking_code}: {str(tracking_info)}"
        except Exception as e:
            return (
                f"Aiyo — I couldn't reach the live tracker for #{tracking_code} just now. "
                f"Give it another try in a moment, or check the order number is right? ({e})"
            )

    if not location:
        return (
            "I'd be happy to check delivery availability and speed! "
            "Could you tell me which city or location in Sri Lanka you want the gift delivered to?"
        )

    # 2. Retrieve live delivery cities
    try:
        cities_res = await kapruka_list_delivery_cities(location)
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