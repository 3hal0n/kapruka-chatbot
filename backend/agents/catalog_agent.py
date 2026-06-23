# agents/catalog_agent.py

import json
import asyncio
import re
from typing import Any
from agents import critic_agent
from utils.config import CLAUDE_MODEL, CLAUDE_MAX_TOKENS_RESPOND, MAX_REFLECTION_ROUNDS, CATALOG_SEARCH_TOP_K
from utils.prompts import CATALOG_SYSTEM_PROMPT, REVISE_SYSTEM_PROMPT
from infrastructure.llm.client import chat, chat_stream


def _generate(user_content: str) -> str:
    return chat(
        system=CATALOG_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_content}],
        max_tokens=CLAUDE_MAX_TOKENS_RESPOND,
        model=CLAUDE_MODEL,
        temperature=0.7,  # creative, warm responses
    )


def _revise(recommendation: str, issues: list, suggestion: str) -> str:
    content = (
        f"Original recommendation:\n{recommendation}\n\n"
        f"Issues found:\n" + "\n".join(f"- {i}" for i in issues) +
        f"\n\nSuggested fix:\n{suggestion or 'Address the issues above.'}"
    )
    return chat(
        system=REVISE_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": content}],
        max_tokens=CLAUDE_MAX_TOKENS_RESPOND,
        model=CLAUDE_MODEL,
    )

def _generate_stream(user_content: str):
    """Streaming version of _generate() — yields chunks as LLM generates."""
    yield from chat_stream(
        system=CATALOG_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_content}],
        max_tokens=CLAUDE_MAX_TOKENS_RESPOND,
        model=CLAUDE_MODEL,
        temperature=0.7,  # warm, creative responses
    )


async def to_async_gen(sync_gen_fn, *args, **kwargs):
    """Bridge a synchronous generator into an asynchronous generator."""
    queue = asyncio.Queue()
    loop = asyncio.get_running_loop()
    
    def worker():
        try:
            for chunk in sync_gen_fn(*args, **kwargs):
                loop.call_soon_threadsafe(queue.put_nowait, chunk)
        except Exception as e:
            loop.call_soon_threadsafe(queue.put_nowait, e)
        finally:
            loop.call_soon_threadsafe(queue.put_nowait, None)
            
    asyncio.create_task(asyncio.to_thread(worker))
    
    while True:
        chunk = await queue.get()
        if chunk is None:
            break
        if isinstance(chunk, Exception):
            raise chunk
        yield chunk


def parse_product_price(price_val: Any) -> float:
    """Parse float product price from int, float, dict, or currency string structures."""
    if isinstance(price_val, (int, float)):
        return float(price_val)
    if isinstance(price_val, dict):
        amt = price_val.get("amount") or price_val.get("price") or 0
        return parse_product_price(amt)
    if isinstance(price_val, str):
        clean = re.sub(r'[^\d.]', '', price_val)
        try:
            return float(clean) if clean else 0.0
        except ValueError:
            pass
    return 0.0


def filter_allergens(products: list, recipient_allergies: set) -> list:
    """
    Deterministic allergen filter — runs BEFORE any LLM call.

    For each allergen term supplied, the function expands it to a set of
    semantically-related substrings covering common naming variants
    (e.g. "nuts" expands to nut, cashew, almond, peanut, pistachio …).
    It then case-insensitively scans four product fields: name, description,
    specs, and category.  Any product matching at least one allergen substring
    in any field is dropped and logged.
    """

    # ── Allergen term expansion map ────────────────────────────────────────────
    # Keys are canonical allergen names (lower-case); values are substrings to
    # match anywhere in a product string.  Add more entries as needed.
    ALLERGEN_EXPANSIONS: dict[str, list[str]] = {
        "nuts":        ["nut", "cashew", "almond", "peanut", "pistachio",
                        "walnut", "hazelnut", "pecan", "macadamia", "praline"],
        "nut":         ["nut", "cashew", "almond", "peanut", "pistachio",
                        "walnut", "hazelnut", "pecan", "macadamia", "praline"],
        "peanut":      ["peanut", "groundnut", "monkey nut"],
        "peanuts":     ["peanut", "groundnut", "monkey nut"],
        "cashew":      ["cashew"],
        "almond":      ["almond"],
        "pistachio":   ["pistachio"],
        "walnut":      ["walnut"],
        "hazelnut":    ["hazelnut", "nutella"],
        "gluten":      ["gluten", "wheat", "barley", "rye", "flour"],
        "dairy":       ["milk", "cream", "butter", "cheese", "lactose", "whey",
                        "casein", "dairy"],
        "milk":        ["milk", "cream", "butter", "cheese", "lactose", "whey",
                        "casein", "dairy"],
        "egg":         ["egg"],
        "eggs":        ["egg"],
        "soy":         ["soy", "soya", "tofu"],
        "seafood":     ["prawn", "shrimp", "crab", "lobster", "fish", "salmon",
                        "tuna", "anchovy", "seafood", "shellfish"],
        "shellfish":   ["prawn", "shrimp", "crab", "lobster", "shellfish"],
        "chocolate":   ["chocolate", "cocoa", "cacao"],
    }

    # Build the flat list of substrings to reject, from all supplied allergens
    reject_terms: set[str] = set()
    for raw_allergen in recipient_allergies:
        term = str(raw_allergen).strip().lower()
        if not term:
            continue
        # Use the expansion if available; otherwise use the raw term itself
        for substring in ALLERGEN_EXPANSIONS.get(term, [term]):
            reject_terms.add(substring)

    if not reject_terms:
        return products  # nothing to filter

    filtered: list = []
    for p in products:
        if not isinstance(p, dict):
            continue

        # Aggregate all searchable text fields into one lower-case blob
        searchable = " ".join([
            str(p.get("name")        or ""),
            str(p.get("description") or ""),   # ← added vs previous version
            str(p.get("specs")       or ""),
            str(p.get("category")    or ""),
        ]).lower()

        hit_term = next((t for t in reject_terms if t in searchable), None)
        if hit_term:
            print(f"[AllergenFilter] Dropped '{p.get('name')}' — matched term '{hit_term}' "
                  f"(allergens: {sorted(recipient_allergies)})")
        else:
            filtered.append(p)

    return filtered


# Occasion-aware fallback search queries
OCCASION_FALLBACKS = {
    "birthday": ["birthday cake", "chocolate", "flowers", "gift hamper"],
    "anniversary": ["flowers", "chocolate box", "jewelry", "gift hamper"],
    "valentine": ["roses", "chocolate", "jewelry", "teddy bear"],
    "graduation": ["pen set", "book", "gift hamper", "watch"],
    "christmas": ["hamper", "chocolate", "gift box", "cake"],
    "mother": ["flowers", "chocolate", "spa", "gift hamper"],
    "father": ["watch", "book", "gift hamper", "cake"],
    "default": ["gift hamper", "chocolate", "flowers", "cake"]
}


def calculate_match_score(product: dict, search_query: str, preferences: set, budget: float = None) -> int:
    """Calculate a relevance match score (0-99) for a product given context."""
    score = 55  # base score
    name = str(product.get("name") or "").lower()
    category = str(product.get("category") or "").lower()
    specs = str(product.get("specs") or "").lower()
    query_words = search_query.lower().split()

    # Name/category keyword match
    matched_words = sum(1 for w in query_words if w in name or w in category)
    score += min(matched_words * 10, 25)

    # Specs keyword match
    if any(w in specs for w in query_words):
        score += 5

    # Preference match bonus
    if preferences:
        if any(str(pref).lower() in name or str(pref).lower() in specs for pref in preferences):
            score += 10

    # Budget fit bonus — well within budget earns more points
    if budget:
        price = parse_product_price(product.get("price"))
        if price > 0:
            if price <= budget * 0.7:
                score += 5  # great value
            elif price <= budget:
                score += 2  # fits budget

    # In-stock bonus
    avail = str(product.get("availability") or product.get("stock") or "").lower()
    if "in stock" in avail or "available" in avail:
        score += 3

    return min(score, 99)


async def run_stream(recipients: set, search_query: str, old_profile: dict, new_profile: dict, query_vector: list = None, budget_limit: float = None, occasion: str = None):
    from infrastructure.mcp.client import kapruka_search_products
    import asyncio

    # Search live products using the Kapruka MCP Client wrapper
    try:
        raw_products = await kapruka_search_products(search_query, limit=CATALOG_SEARCH_TOP_K)
        # Parse products if wrapper returned a dict (e.g. {"products": [...]})
        if isinstance(raw_products, dict):
            products = raw_products.get("products") or raw_products.get("result") or []
        else:
            products = raw_products or []
    except Exception as e:
        print(f"Error calling live kapruka_search_products: {e}")
        products = []

    # Ensure products is a list of dictionaries
    if isinstance(products, str) or not isinstance(products, list):
        products = []
    else:
        products = [p for p in products if isinstance(p, dict)]

    # Filter products by price if budget limit is provided
    if budget_limit is not None:
        filtered_by_price = []
        for p in products:
            price_val = p.get("price")
            product_price = parse_product_price(price_val)
            if product_price <= budget_limit:
                filtered_by_price.append(p)
        products = filtered_by_price

    # Fallback to broader queries if results are empty or very low (less than 3 items)
    if len(products) < 3:
        sq_lower = search_query.lower()
        occ_lower = (occasion or "").lower()

        # ── CATEGORY FIDELITY: only generate fallback queries that respect the
        # user's explicit product category.  If the user asked for "flowers",
        # fallback queries must also be flower-adjacent — never substitute cakes
        # or chocolates.  A fallback is ONLY applied when the original query is
        # genuinely vague (e.g. "birthday gift", "something nice").
        GENERIC_TERMS = {"gift", "present", "surprise", "item", "something", "nice"}
        query_is_specific = sq_lower not in GENERIC_TERMS and len(sq_lower.split()) <= 3

        if query_is_specific:
            # The user named a concrete product — retry the SAME query with
            # broader pagination rather than switching to a different category.
            fallback_queries: list[str] = [search_query]
        else:
            # Vague query — use occasion-aware fallback list
            fallback_queries = []
            for key, queries in OCCASION_FALLBACKS.items():
                if key in sq_lower or key in occ_lower:
                    fallback_queries = queries
                    break
            if not fallback_queries:
                fallback_queries = OCCASION_FALLBACKS["default"]
        
        for fq in fallback_queries:
            if fq.lower() == sq_lower and fq == search_query:
                # Same query already tried — skip to avoid infinite loop
                continue
            try:
                print(f"Low results for '{search_query}'. Trying fallback search query: '{fq}'")
                fallback_res = await kapruka_search_products(fq, limit=CATALOG_SEARCH_TOP_K)
                fb_products = []
                if isinstance(fallback_res, dict):
                    fb_products = fallback_res.get("products") or fallback_res.get("result") or []
                elif isinstance(fallback_res, list):
                    fb_products = fallback_res
                
                if fb_products:
                    fb_products = [p for p in fb_products if isinstance(p, dict)]
                    if budget_limit is not None:
                        fb_products = [p for p in fb_products if parse_product_price(p.get("price")) <= budget_limit]
                    products.extend(fb_products)
                    # Remove duplicates based on product ID
                    seen: set = set()
                    deduped: list = []
                    for p in products:
                        pid = p.get("id") or p.get("code")
                        if pid not in seen:
                            seen.add(pid)
                            deduped.append(p)
                    products = deduped
                    if len(products) >= 5:
                        break
            except Exception as e:
                print(f"Fallback query '{fq}' failed: {e}")

    if not products:
        yield "Sorry! I couldn't find any products matching your description on Kapruka right now."
        return

    # Extract recipient attributes
    allergies = {}
    preferences = {}
    location = {}
    all_allergies_set = set()
    for res in recipients:
        allergies[res]   = set((old_profile["allergies"].get(res, []) or []) + (new_profile["allergies"].get(res, []) or []))
        preferences[res] = set((old_profile["preferences"].get(res, []) or []) + (new_profile["preferences"].get(res, []) or []))
        location[res]    = old_profile.get("location", {}).get(res, "") or new_profile.get("location", {}).get(res, "")
        all_allergies_set.update(allergies[res])

    # Rule-based deterministic allergen filtering
    filtered_products = filter_allergens(products, all_allergies_set)
    if not filtered_products:
        yield "I searched the catalog, but all matching products contained allergens you avoid. Could you try checking for other items?"
        return

    # Add match scores to each product
    all_preferences_set = set()
    for res in recipients:
        all_preferences_set.update(preferences.get(res, set()))
    
    for p in filtered_products:
        p["match_score"] = calculate_match_score(p, search_query, all_preferences_set, budget_limit)
    
    # Sort by match score descending
    filtered_products.sort(key=lambda p: p.get("match_score", 0), reverse=True)

    # ── PRE-EMIT HARD ALLERGEN GUARD ─────────────────────────────────────────
    # Run a final unconditional allergen filter pass immediately before the
    # <<PRODUCTS>> payload is sent to the frontend.  This is the last line of
    # defence against any product that slipped through earlier processing
    # (e.g. fallback queries that bypassed the first filter, or products whose
    # description field was absent in the initial pass but is now populated).
    if all_allergies_set:
        pre_emit_count = len(filtered_products)
        filtered_products = filter_allergens(filtered_products, all_allergies_set)
        dropped = pre_emit_count - len(filtered_products)
        if dropped:
            print(f"[AllergenFilter] Pre-emit guard dropped {dropped} additional product(s).")
        if not filtered_products:
            yield ("I searched the catalog, but all matching products contained allergens "
                   "you avoid. Could you try a different category?")
            return

    # Yield filtered products as metadata token
    yield f"<<PRODUCTS>>:{json.dumps(filtered_products)}"

    product_lines = [
        f"- {p.get('name', 'Unknown')} | Price: {p.get('price', 'N/A')} "
        f"| Category: {p.get('category', 'N/A')} | Stock: {p.get('availability') or p.get('stock') or 'Unknown'} "
        f"| Specs: {p.get('specs', 'N/A')} | Checkout Ready: {p.get('checkout_ready', True)}"
        for p in filtered_products
    ]

    profile_summary = {"allergies": allergies, "preferences": preferences, "location": location}

    # Build context-rich notes for the LLM
    context_notes = []
    if occasion:
        context_notes.append(f"Occasion: {occasion}")
    if budget_limit:
        context_notes.append(f"Budget: LKR {int(budget_limit)} (all shown products fit)")
    if all_allergies_set:
        allergen_names = ", ".join(sorted(all_allergies_set))
        context_notes.append(f"Allergens filtered out: {allergen_names} — reassure the user these have been removed")
    if all_preferences_set:
        pref_names = ", ".join(sorted(all_preferences_set))
        context_notes.append(f"Known preferences: {pref_names} — mention them naturally if relevant")

    context_block = "\n".join(context_notes) if context_notes else ""

    user_content = (
        f"{context_block}\n" if context_block else ""
    ) + (
        f"Recipients: {', '.join(str(r) for r in recipients) if recipients else 'someone special'}\n"
        f"Search: {search_query}\n\n"
        f"Matching products:\n" + "\n".join(product_lines)
    )

    # 1. Stream draft — collect full text while yielding chunks
    draft_chunks = []
    async for chunk in to_async_gen(_generate_stream, user_content):
        draft_chunks.append(chunk)
        yield chunk

    draft = "".join(draft_chunks)
    print("\n[Catalog] Draft streamed.")

    # 2. Check if critic needed — only run when allergens are present (safety-critical)
    has_allergies = any(len(v) > 0 for v in allergies.values()) if allergies else False
    skip_critic = not has_allergies  # skip if no allergens; preferences alone don't need critic
    if skip_critic:
        print("[Critic] Skipped — no allergen constraints.")
        return

    # 3. Run critic on full draft
    critique = await critic_agent.critique(
        recommendation=draft,
        search_query=search_query,
        profile=profile_summary,
        recipients=recipients or "",
        products=filtered_products
    )

    if critique.get("approved") == True:
        print("Critic Approved.")
        return

    # reflection pattern
    rounds = 0
    revised = draft

    while ((critique.get("approved") == False) and (rounds < MAX_REFLECTION_ROUNDS)):
        issues = critique.get("issues", [])
        suggestion = critique.get("suggestion", "")

        content = (
            f"Original recommendation:\n{revised}\n\n"
            f"Issues found:\n" + "\n".join(f"- {i}" for i in issues) +
            f"\n\nSuggested fix:\n{suggestion or 'Address the issues above.'}"
        )

        yield "<<CRITIC>>"  # wipes the draft from the ui

        # Collect silently — no yielding yet
        revised_chunks = []
        async for chunk in to_async_gen(
            chat_stream,
            system=REVISE_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": content}],
            max_tokens=CLAUDE_MAX_TOKENS_RESPOND,
            model=CLAUDE_MODEL,
            temperature=0.5,  # balanced revision
        ):
            revised_chunks.append(chunk)
            yield chunk

        revised = "".join(revised_chunks)

        critique = await critic_agent.critique(
            recommendation=revised,
            search_query=search_query,
            profile=profile_summary,
            recipients=recipients or "",
            products=filtered_products
        )
        rounds += 1
