import json
import concurrent.futures
import threading
from memory.st_memory import ShortTermMemory
from memory.semantic_memory import add_or_update_profile, get_profile
from agents import catalog_agent, logistics_agent
from utils.config import CLAUDE_MODEL_CLASSIFY, CLAUDE_MAX_TOKENS_CLASSIFY
from utils.prompts import ROUTER_SYSTEM_PROMPT
from infrastructure.llm.client import chat
import time
from pydantic import BaseModel
from typing import Literal


class CartItemQuery(BaseModel):
    query: str
    quantity: int = 1


class RouterOutput(BaseModel):
    intents: list[Literal["SEARCH", "LOGISTICS", "PREFERENCE_UPDATE", "CART_ACTION"]]
    allergies: dict
    preferences: dict
    search_recipient: str | list | None
    location: str | None
    deadline: str | None
    search_query: str | None
    budget_limit: float | None = None   # LLM-extracted numeric budget ceiling in LKR
    tracking_code: str | None
    cart_items: list[CartItemQuery] | None = None
    trigger_checkout: bool | None = False
    recipient_name: str | None = None
    delivery_address: str | None = None
    contact_number: str | None = None



class Router:
    def __init__(self, customer_id: str):
        self.customer_id = customer_id
        self.st_memory = ShortTermMemory()

    def classify_intents(self, user_message: str) -> dict:

        history = self.st_memory.get_history()
        messages = history + [{"role": "user", "content": user_message}]

        raw = chat(
            system=ROUTER_SYSTEM_PROMPT,
            messages=messages,
            max_tokens=CLAUDE_MAX_TOKENS_CLASSIFY,
            model=CLAUDE_MODEL_CLASSIFY,
            json_mode=True,
            temperature=0.1,  # deterministic JSON classification
        )

        #structured output extraction - json format
        clean = raw.strip()
        start = clean.find("{")
        end = clean.rfind("}") + 1
        if start != -1 and end > start:
            clean = clean[start:end]

        try:
            result = json.loads(clean)
            validated = RouterOutput(**result) #pydantic validation 
            result = validated.model_dump()
            if isinstance(result.get("intents"), str):
                result["intents"] = [result["intents"]]
            if not isinstance(result.get("allergies"), dict):
                result["allergies"] = {}
            if not isinstance(result.get("preferences"), dict):
                result["preferences"] = {}
            return result

        except (json.JSONDecodeError, ValueError): #value errors for pydantic errors
            return {
                "intents": ["SEARCH"],
                "allergies": {},
                "preferences": {},
                "search_recipient": None,
                "location": None,
                "deadline": None,
                "search_query": user_message,
                "budget_limit": None,
                "tracking_code": None,
                "cart_items": None,
                "trigger_checkout": False,
                "recipient_name": None,
                "delivery_address": None,
                "contact_number": None
            }

    # ── Context continuity helper ─────────────────────────────────────────────

    def _enrich_from_history(self, classification: dict) -> dict:
        """
        Scan short-term memory for constraints the current turn omitted.

        Rules:
        - location: If the LLM returned null this turn, walk backwards through
          history and reuse the last explicitly stated city/district.
        - allergies: Merge any allergen sets extracted from prior turns into the
          current classification so they are never silently dropped when the user
          switches product category mid-session.
        - budget_limit: If no budget this turn, carry forward the last stated one.

        This is deterministic Python — no LLM call required.
        """
        import re as _re

        history = self.st_memory.get_history()
        if not history:
            return classification

        # ── 1. Carry forward location ─────────────────────────────────────────
        if not classification.get("location"):
            # Walk history in reverse; look for a prior assistant/user JSON block
            # that contained a non-null location.
            for msg in reversed(history):
                content = msg.get("content", "")
                # Try to find a JSON blob in the message (router stores classification)
                try:
                    # assistant messages from route_stream start with the full text,
                    # but we also store classification in SSE — look for any JSON object
                    start_idx = content.find("{")
                    end_idx = content.rfind("}") + 1
                    if start_idx != -1 and end_idx > start_idx:
                        blob = json.loads(content[start_idx:end_idx])
                        past_loc = blob.get("location")
                        if past_loc and isinstance(past_loc, str):
                            classification["location"] = past_loc
                            print(f"[Continuity] Carried forward location from history: '{past_loc}'")
                            break
                except (json.JSONDecodeError, Exception):
                    pass

        # ── 2. Merge allergens from history ───────────────────────────────────
        # Collect all allergen dicts from prior classification blobs in memory
        for msg in history:
            content = msg.get("content", "")
            try:
                start_idx = content.find("{")
                end_idx = content.rfind("}") + 1
                if start_idx == -1 or end_idx <= start_idx:
                    continue
                blob = json.loads(content[start_idx:end_idx])
                past_allergies = blob.get("allergies")
                if not isinstance(past_allergies, dict):
                    continue
                # Merge each recipient's allergen list into the current classification
                current_allergies = classification.get("allergies") or {}
                for recipient, allergen_list in past_allergies.items():
                    if not isinstance(allergen_list, list) or not allergen_list:
                        continue
                    if recipient not in current_allergies:
                        current_allergies[recipient] = []
                    merged = list(set(current_allergies[recipient] + allergen_list))
                    current_allergies[recipient] = merged
                    if merged:
                        print(f"[Continuity] Merged allergens for '{recipient}': {merged}")
                classification["allergies"] = current_allergies
            except (json.JSONDecodeError, Exception):
                pass

        # ── 3. Carry forward budget if none this turn ─────────────────────────
        if classification.get("budget_limit") is None:
            for msg in reversed(history):
                content = msg.get("content", "")
                try:
                    start_idx = content.find("{")
                    end_idx = content.rfind("}") + 1
                    if start_idx != -1 and end_idx > start_idx:
                        blob = json.loads(content[start_idx:end_idx])
                        past_budget = blob.get("budget_limit")
                        if past_budget is not None:
                            classification["budget_limit"] = float(past_budget)
                            print(f"[Continuity] Carried forward budget: {past_budget}")
                            break
                except (json.JSONDecodeError, Exception):
                    pass

        return classification

    async def route_stream(self, user_message: str, recipient_context: dict | None = None, budget_limit: float | None = None):
        """Streaming version of route() — yields chunks for SEARCH responses."""
        import asyncio

        # Classify intents using asyncio task
        start = time.time()
        print('classifying tasks starting...')
        classification = await asyncio.to_thread(self.classify_intents, user_message)
        query_vector = []
        end = time.time()

        print(f'classifying tasks completed in: {end-start:.2f}s')

        # ── SESSION CONTEXT CONTINUITY ─────────────────────────────────────────
        # Must run FIRST so that budget, location, and allergens recovered from
        # history are available for all subsequent processing in this turn.
        classification = self._enrich_from_history(classification)

        # Merge LLM-extracted / history-recovered budget with caller-provided
        # regex budget. Use the tighter (lower) constraint when both are present.
        llm_budget = classification.get("budget_limit")
        if llm_budget is not None:
            try:
                llm_budget = float(llm_budget)
            except (TypeError, ValueError):
                llm_budget = None
        if llm_budget is not None and budget_limit is not None:
            budget_limit = min(budget_limit, llm_budget)
        elif llm_budget is not None:
            budget_limit = llm_budget

        print(f"Effective budget_limit : {budget_limit}")

        intents = classification.get("intents", ["SEARCH"])

        print(f"Customer        : {self.customer_id}")
        print(f"Router Decision : {intents}")
        print(f"Extracted+Enriched: {json.dumps(classification, indent=2)}")

        # Yield classification token for SSE handler
        yield f"<<CLASSIFICATION>>:{json.dumps(classification)}"

        # Initialize response chunks list early (needed by CART_ACTION block below)
        full_response_chunks = []

        # Handle CART_ACTION
        cart_products_to_add = []
        if "CART_ACTION" in intents:
            cart_items = classification.get("cart_items") or []
            trigger_checkout = classification.get("trigger_checkout") or False
            
            for item in cart_items:
                q = item.get("query")
                quantity = item.get("quantity", 1)
                if q:
                    try:
                        from infrastructure.mcp.client import kapruka_search_products
                        search_res = await kapruka_search_products(q, limit=1)
                        products = []
                        if isinstance(search_res, dict):
                            products = search_res.get("products") or search_res.get("result") or []
                        elif isinstance(search_res, list):
                            products = search_res
                            
                        if products:
                            # Take the first product matching and set its quantity
                            p_to_add = dict(products[0])
                            p_to_add["quantity"] = quantity
                            cart_products_to_add.append(p_to_add)
                    except Exception as e:
                        print(f"Error searching product '{q}' for cart: {e}")
            
            # If products were matched or checkout is triggered, yield <<CART_UPDATE>>:
            if cart_products_to_add or trigger_checkout:
                cart_update_payload = {
                    "products": cart_products_to_add,
                    "trigger_checkout": trigger_checkout,
                    "recipient_name": classification.get("recipient_name"),
                    "delivery_address": classification.get("delivery_address"),
                    "contact_number": classification.get("contact_number")
                }
                yield f"<<CART_UPDATE>>:{json.dumps(cart_update_payload)}"

            # Confirm to the user
            if cart_products_to_add:
                names = ", ".join([p.get("name", "Item") for p in cart_products_to_add])
                confirm_msg = f"Done! I've added {names} to your cart. "
                if trigger_checkout:
                    confirm_msg += "Generating your checkout link now..."
                yield confirm_msg
                full_response_chunks.append(confirm_msg)
            elif trigger_checkout:
                confirm_msg = "Perfect! Generating your checkout link now. Please review the details in the popup..."
                yield confirm_msg
                full_response_chunks.append(confirm_msg)

        # 2. allergies_dict and preferences_dict still needed for PREFERENCE_UPDATE
        allergies_dict = classification.get("allergies") or {}
        preferences_dict = classification.get("preferences") or {}
        location = classification.get("location") or "" 
        old_profile = {
                "allergies": {},
                "preferences": {},
                "location": {}
            }

        new_profile = {
                "allergies": {},
                "preferences": {},
                "location": {}
                }

        # 3. Load old profile and merge recipient_context
        recipient = classification.get("search_recipient")
        if isinstance(recipient, list):
            recipient_list = [r for r in recipient if r]
        else:
            recipient_list = [recipient] if recipient else []

        # Parse and load recipient_context overrides
        context_profiles = {}
        if recipient_context and isinstance(recipient_context, dict):
            if any(k in recipient_context for k in ["recipient", "allergies", "preferences", "location"]):
                rec_name = recipient_context.get("recipient") or (recipient_list[0] if recipient_list else "self")
                rec_name = str(rec_name).lower()
                context_profiles[rec_name] = {
                    "allergies": recipient_context.get("allergies") or [],
                    "preferences": recipient_context.get("preferences") or [],
                    "location": recipient_context.get("location") or ""
                }
            else:
                for k, v in recipient_context.items():
                    if isinstance(v, dict):
                        context_profiles[k.lower()] = {
                            "allergies": v.get("allergies") or [],
                            "preferences": v.get("preferences") or [],
                            "location": v.get("location") or ""
                        }

        # Merge context recipient names into list
        for name in context_profiles.keys():
            if name not in recipient_list:
                recipient_list.append(name)

        # Build old and new profiles for all targets
        for name in recipient_list:
            p = get_profile(self.customer_id, name) or {}
            ctx = context_profiles.get(name.lower(), {})

            merged_allergies = list(set((p.get("allergies") or []) + (ctx.get("allergies") or [])))
            merged_preferences = list(set((p.get("preferences") or []) + (ctx.get("preferences") or [])))
            merged_location = ctx.get("location") or p.get("location") or ""

            old_profile['allergies'][name] = merged_allergies
            old_profile['preferences'][name] = merged_preferences
            old_profile['location'][name] = merged_location

            new_profile['allergies'][name] = allergies_dict.get(name, [])
            new_profile['preferences'][name] = preferences_dict.get(name, [])
            new_profile['location'][name] = location
        
        print("old profile is" ,old_profile)
        print("new profile is",new_profile)

        # Initialize recipients set (full_response_chunks already initialized above)
        all_recipients = set(recipient_list)

        # 4. PREFERENCE_UPDATE — fire and forget
        if "PREFERENCE_UPDATE" in intents:
            all_recipients.update(allergies_dict.keys())
            all_recipients.update(preferences_dict.keys())
            print('preference update thread starts...')
            for name in all_recipients:
                t = threading.Thread(target=add_or_update_profile, kwargs={
                    "customer_id": self.customer_id,
                    "name": name,
                    "allergies": list(set(allergies_dict.get(name, []) + context_profiles.get(name, {}).get("allergies", []))),
                    "preferences": list(set(preferences_dict.get(name, []) + context_profiles.get(name, {}).get("preferences", []))),
                    "location": context_profiles.get(name, {}).get("location") or classification.get("location") or ""
                })
                t.daemon = True
                t.start()
                yield "<<PREF_SAVING>>"

        # 5. Firing logistics in background
        logistics_task = None
        if "LOGISTICS" in intents:
            print('logistic intent async task fired...')
            logistics_task = asyncio.create_task(
                logistics_agent.run(
                    location=classification.get("location"),
                    deadline=classification.get("deadline"),
                    tracking_code=classification.get("tracking_code")
                )
            )
            yield "<<LOGISTICS>>"
                
        # 6. Stream search — logistics already running in background
        if "SEARCH" in intents:
            async for chunk in catalog_agent.run_stream(
                recipients=all_recipients,
                search_query=classification.get("search_query") or user_message,
                old_profile=old_profile,
                new_profile=new_profile,
                query_vector=query_vector,
                budget_limit=budget_limit,
                occasion=classification.get("occasion") or (recipient_context or {}).get("occasion")
            ):
                if chunk != "<<CLEAR>>":
                    full_response_chunks.append(chunk)
                yield chunk 

        # 7. Logistics already done by now — yield it
        if "LOGISTICS" in intents and logistics_task:
            logistics_result = await logistics_task
            yield "\n\n" + logistics_result
            full_response_chunks.append("\n\n" + logistics_result)

        # 8. Save to memory — store the classification alongside the user message
        # so _enrich_from_history can recover location/allergies on future turns.
        full_response = "".join(full_response_chunks)
        pref_msg = f"Got it — I'm updating preferences for {', '.join(all_recipients)}.\n\n" if "PREFERENCE_UPDATE" in intents else ""
        self.st_memory.add_message("user", user_message + " " + json.dumps(classification))
        self.st_memory.add_message("assistant", pref_msg + full_response)