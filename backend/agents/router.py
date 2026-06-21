import json
import concurrent.futures
import threading
from memory.st_memory import ShortTermMemory
from memory.semantic_memory import add_or_update_profile, get_profile
from agents import catalog_agent, logistics_agent
from utils.config import CLAUDE_MODEL_CLASSIFY, CLAUDE_MAX_TOKENS_CLASSIFY
from utils.prompts import ROUTER_SYSTEM_PROMPT
from infrastructure.llm.client import chat
from memory.lt_memory import precompute_embedding
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
                "tracking_code": None,
                "cart_items": None,
                "trigger_checkout": False,
                "recipient_name": None,
                "delivery_address": None,
                "contact_number": None
            }

    async def route_stream(self, user_message: str, recipient_context: dict | None = None):
        """Streaming version of route() — yields chunks for SEARCH responses."""
        import asyncio

        # 1. Classify and embedding in parallel using asyncio tasks
        start = time.time()
        print('classifying tasks starting...')
        classify_task = asyncio.create_task(asyncio.to_thread(self.classify_intents, user_message))
        encode_task = asyncio.create_task(asyncio.to_thread(precompute_embedding, user_message))
        
        classification = await classify_task
        query_vector = await encode_task
        end = time.time()

        print(f'classifying tasks completed in: {end-start:.2f}s') 

        intents = classification.get("intents", ["SEARCH"])

        print(f"Customer        : {self.customer_id}")
        print(f"Router Decision : {intents}")
        print(f"Extracted       : {json.dumps(classification, indent=2)}")

        # Yield classification token for SSE handler
        yield f"<<CLASSIFICATION>>:{json.dumps(classification)}"

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

        # Initialize before if blocks
        all_recipients = set(recipient_list)
        full_response_chunks = []

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
                query_vector=query_vector
            ):
                if chunk != "<<CLEAR>>":
                    full_response_chunks.append(chunk)
                yield chunk 

        # 7. Logistics already done by now — yield it
        if "LOGISTICS" in intents and logistics_task:
            logistics_result = await logistics_task
            yield "\n\n" + logistics_result
            full_response_chunks.append("\n\n" + logistics_result)

        # 8. Save to memory
        full_response = "".join(full_response_chunks)
        pref_msg = f"Got it — I'm updating preferences for {', '.join(all_recipients)}.\n\n" if "PREFERENCE_UPDATE" in intents else ""
        self.st_memory.add_message("user", user_message)
        self.st_memory.add_message("assistant", pref_msg + full_response)