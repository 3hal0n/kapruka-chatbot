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

    Uses word-boundary matching (not raw substring) to prevent false positives
    on words like "coconut", "donut", "natural", or "fortune cookie" that contain
    the substring "nut" but are not tree-nut allergens.

    For each allergen term, expands to a full synonym set and checks four
    product fields: name, description, specs, category.
    """

    # ── Allergen term expansion map ────────────────────────────────────────────
    ALLERGEN_EXPANSIONS: dict[str, list[str]] = {
        "nuts":        ["nut", "nuts", "cashew", "almond", "peanut", "peanuts",
                        "pistachio", "walnut", "hazelnut", "pecan", "macadamia",
                        "praline", "mixed nut", "nut mix"],
        "nut":         ["nut", "nuts", "cashew", "almond", "peanut", "peanuts",
                        "pistachio", "walnut", "hazelnut", "pecan", "macadamia",
                        "praline", "mixed nut", "nut mix"],
        "peanut":      ["peanut", "peanuts", "groundnut", "monkey nut"],
        "peanuts":     ["peanut", "peanuts", "groundnut", "monkey nut"],
        "cashew":      ["cashew", "cashews"],
        "almond":      ["almond", "almonds"],
        "pistachio":   ["pistachio", "pistachios"],
        "walnut":      ["walnut", "walnuts"],
        "hazelnut":    ["hazelnut", "hazelnuts", "nutella"],
        "gluten":      ["gluten", "wheat", "barley", "rye", "flour"],
        "dairy":       ["milk", "cream", "butter", "cheese", "lactose", "whey",
                        "casein", "dairy"],
        "milk":        ["milk", "cream", "butter", "cheese", "lactose", "whey",
                        "casein", "dairy"],
        "egg":         ["egg", "eggs"],
        "eggs":        ["egg", "eggs"],
        "soy":         ["soy", "soya", "tofu"],
        "seafood":     ["prawn", "shrimp", "crab", "lobster", "fish", "salmon",
                        "tuna", "anchovy", "seafood", "shellfish"],
        "shellfish":   ["prawn", "shrimp", "crab", "lobster", "shellfish"],
        "chocolate":   ["chocolate", "cocoa", "cacao"],
    }

    # ── Terms that are SAFE false-positive substrings — never reject on these alone
    # e.g. "coconut" contains "nut" but is not a tree nut allergen
    NUT_FALSE_POSITIVES = {"coconut", "doughnut", "donut", "minute", "natural",
                           "fortunate", "fortune", "peanut butter cookie",
                           "chestnut"}  # chestnut is debated; keep in safe list

    # Build the flat set of word-boundary patterns to reject
    reject_terms: set[str] = set()
    for raw_allergen in recipient_allergies:
        term = str(raw_allergen).strip().lower()
        if not term:
            continue
        for substring in ALLERGEN_EXPANSIONS.get(term, [term]):
            reject_terms.add(substring)

    if not reject_terms:
        return products  # nothing to filter

    # Pre-compile word-boundary patterns for efficiency
    import re as _re
    compiled: list[tuple[str, "_re.Pattern"]] = []
    for t in reject_terms:
        # Use word boundary so "nut" matches "nut" and "nuts" but NOT "coconut"
        pattern = _re.compile(r'\b' + _re.escape(t) + r'\b', _re.IGNORECASE)
        compiled.append((t, pattern))

    filtered: list = []
    for p in products:
        if not isinstance(p, dict):
            continue

        # Aggregate all searchable text fields into one blob
        raw_searchable = " ".join([
            str(p.get("name")        or ""),
            str(p.get("description") or ""),
            str(p.get("specs")       or ""),
            str(p.get("category")    or ""),
        ])
        searchable_lower = raw_searchable.lower()

        # Check for false-positive product types first
        is_false_positive = any(fp in searchable_lower for fp in NUT_FALSE_POSITIVES)

        hit_term = None
        for term, pattern in compiled:
            # Skip if this specific term is a false-positive match
            if term in ("nut", "nuts") and is_false_positive:
                # Deeper check: if name/desc contains coconut/donut but NOT other nut types
                other_nuts = {"cashew", "almond", "peanut", "pistachio", "walnut",
                              "hazelnut", "pecan", "macadamia", "praline"}
                has_other = any(on in searchable_lower for on in other_nuts)
                if not has_other:
                    continue  # skip the nut/nuts pattern — false positive

            if pattern.search(raw_searchable):
                hit_term = term
                break

        if hit_term:
            print(f"[AllergenFilter] Dropped '{p.get('name')}' — word-boundary match '{hit_term}' "
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
    "father": ["wallet", "watch", "gift hamper", "perfume"],
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


def _sanitise_search_query(query: str) -> str:
    """
    Clean a search query before it is sent to the Kapruka MCP server.

    Operations (in order):
    1. Translate known Sinhala/Singlish product words to their English equivalents.
    2. Strip location noise tokens that can bleed in from mixed-script sentences
       (e.g. "walata", "kiyana", "welin", "side", "area", "district").
    3. Remove trailing punctuation, collapse whitespace, lowercase.
    4. Truncate to 60 chars so the MCP query string stays clean.
    """
    if not query:
        return "gift"

    # ── Sinhala/Singlish → English product keyword map ────────────────────────
    # Keys are raw tokens (lower-case) that may arrive from the router.
    SINHALA_TO_EN: dict[str, str] = {
        # Flowers / plants
        "mal":          "flowers",
        "mala":         "flowers",
        "pushpa":       "flowers",
        "rose":         "roses",
        "mal pettiya":  "flowers",
        # Cakes / sweets
        "케이크":        "cake",
        "cake ekak":    "cake",
        "birthday cake ekak": "birthday cake",
        "kavili":       "sweets",
        "kiri piti":    "milk sweets",
        # Chocolates
        "choco":        "chocolate",
        "chocolates":   "chocolate",
        # Gifts / hampers
        "gift ekak":    "gift",
        "hadanna":      "gift",   # "make/find" — treat as generic gift search
        "thohfe":       "gift",
        # Occasion-qualified gift phrases → strip occasion, keep "gift"
        "fathers day gift": "gift",
        "father's day gift": "gift",
        "mothers day gift": "gift",
        "mother's day gift": "gift",
        "birthday gift":    "gift",
        "birthday cake":    "birthday cake",  # keep specific cake intent
        "christmas gift":   "gift",
        # Food / fruits
        "pala thiththa": "fruit basket",
        "amba":         "mango",
        # Jewellery / accessories
        "necklace ekak": "necklace",
        "bag ekak":     "bag",
    }

    # Location / occasion noise words to strip (these are NOT product keywords)
    LOCATION_NOISE = {
        "walata", "welin", "kiyana", "side", "area", "district",
        "deliver", "delivery", "karanna", "puluwanda", "thiyenawa",
        "ekak", "hadanna", "enna", "oni", "wenne", "nehe",
        "for", "to", "from", "the", "a", "an",
        # Occasion words that sometimes leak from the router into the search query
        "fathers", "father's", "mothers", "mother's",
        "birthday", "anniversary", "christmas", "valentine",
    }

    q = query.strip()

    # 1. Multi-word phrase replacements first (longest match wins)
    q_lower = q.lower()
    for sinhala_phrase, english_kw in sorted(SINHALA_TO_EN.items(), key=lambda x: -len(x[0])):
        if sinhala_phrase in q_lower:
            q = english_kw
            q_lower = q.lower()
            break  # one replacement is enough

    # 2. Strip individual noise tokens
    tokens = q.split()
    cleaned_tokens = [t for t in tokens if t.lower().strip(".,!?") not in LOCATION_NOISE]
    q = " ".join(cleaned_tokens).strip() if cleaned_tokens else q

    # 3. Remove trailing punctuation and collapse whitespace
    q = re.sub(r'[^\w\s\-]', ' ', q)
    q = re.sub(r'\s+', ' ', q).strip()

    # 4. Truncate
    q = q[:60]

    # 5. Final fallback — if nothing remains, return "gift"
    return q if q else "gift"


async def run_stream(recipients: set, search_query: str, old_profile: dict, new_profile: dict, query_vector: list = None, budget_limit: float = None, occasion: str = None, user_raw_message: str = "", vibe_check: str = None, profile_allergies: list = None):
    from infrastructure.mcp.client import kapruka_search_products
    import asyncio

    # ── QUERY SANITISATION ────────────────────────────────────────────────────
    # Normalise the search_query before hitting the MCP server.
    # 1. Strip location noise tokens that sometimes leak from Sinhala/Singlish.
    # 2. Translate common Sinhala product terms to English MCP-indexed keywords.
    # 3. Collapse whitespace and lowercase.
    search_query = _sanitise_search_query(search_query)

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

    # ── ZERO-TRUST PRE-LLM ALLERGEN HARD-STOP ────────────────────────────────
    # This executes immediately after the raw MCP payload is parsed — before
    # price filtering, fallback queries, scoring, or any LLM call.
    #
    # Two independent trigger paths (either is sufficient to activate the purge):
    #   A. Profile-based  — any recipient's stored allergen list is non-empty.
    #   B. Message-based  — the raw user message contains a nut/allergen keyword.
    #
    # Uses simple case-insensitive substring matching (no word-boundary) for
    # maximum recall at this gate.  The more precise word-boundary filter
    # (filter_allergens) runs again later as the definitive pass.
    _DANGER_WORDS = [
        "nut", "nuts", "pistachio", "cashew", "almond",
        "peanut", "walnut", "hazelnut", "groundnut",
    ]

    # Determine whether the profile already has allergens recorded
    _profile_has_allergies = any(
        bool(v)
        for profile_dict in (old_profile, new_profile)
        for v in (profile_dict.get("allergies") or {}).values()
    )

    # Check whether the raw user message itself signals an allergen concern
    _msg_triggers_danger = any(
        kw in user_raw_message.lower() for kw in _DANGER_WORDS
    )

    if _profile_has_allergies or _msg_triggers_danger:
        pre_purge_count = len(products)
        products = [
            p for p in products
            if not any(
                kw in (p.get("name") or "").lower() or
                kw in (p.get("description") or "").lower()
                for kw in _DANGER_WORDS
            )
        ]
        purged = pre_purge_count - len(products)
        if purged:
            trigger = "profile allergens" if _profile_has_allergies else "message keyword"
            print(
                f"[HardStop:AllergenPurge] Removed {purged} product(s) from raw MCP payload "
                f"(trigger: {trigger}). {len(products)} product(s) remain."
            )

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
        GENERIC_TERMS = {
            "gift", "present", "surprise", "item", "something", "nice",
            # Occasion-qualified "gift" queries are also vague (no product category named)
            "fathers day gift", "father's day gift", "mothers day gift", "mother's day gift",
            "birthday gift", "anniversary gift", "christmas gift", "valentine gift",
        }
        # A query is specific only when it names a real product category (≤2 words) AND
        # is not a generic gift/occasion phrase.
        query_is_specific = sq_lower not in GENERIC_TERMS and len(sq_lower.split()) <= 2

        if query_is_specific:
            # The user named a concrete product — retry the SAME query with
            # broader pagination rather than switching to a different category.
            fallback_queries: list[str] = [search_query]
        else:
            # Vague query — use occasion-aware fallback list
            # occ_lower may contain full strings like "father's day"; match on stem word
            fallback_queries = []
            for key, queries in OCCASION_FALLBACKS.items():
                if key in sq_lower or key in occ_lower or key.rstrip("s") in occ_lower:
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

    # ── CATEGORY FIDELITY FILTER ─────────────────────────────────────────────
    # Kapruka's keyword search matches "flowers" against anything with the word
    # in its title — including "Flower Ribbon Cake". When the user explicitly
    # named a category, purge products from a conflicting category. Never
    # filters down to an empty list (better off-category than nothing).
    CATEGORY_CONFLICTS: list[tuple[set, set]] = [
        # user asked for →       must not show
        ({"flower", "flowers", "rose", "roses", "bouquet"}, {"cake", "cakes"}),
        # For cake queries only ban unambiguous flower products (bouquets) —
        # flower-DECORATED cakes ("Fresh Flowers Cake") are valid cake results.
        ({"cake", "cakes"}, {"bouquet"}),
    ]
    _sq_tokens = set(re.findall(r"[a-z]+", search_query.lower()))
    for _wanted, _banned in CATEGORY_CONFLICTS:
        if (_sq_tokens & _wanted) and not (_sq_tokens & _banned):
            def _off_category(p: dict, banned=_banned) -> bool:
                hay = f"{p.get('name') or ''} {p.get('category') or ''}".lower()
                return any(b in hay for b in banned)

            _kept = [p for p in products if not _off_category(p)]
            if _kept and len(_kept) < len(products):
                print(
                    f"[CategoryFidelity] Dropped {len(products) - len(_kept)} "
                    f"off-category product(s) for query '{search_query}'."
                )
                products = _kept

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

    # ── ALLERGEN SAFETY NET ───────────────────────────────────────────────────
    # Layer 1: profile dicts (persisted + context overrides)
    for profile_dict in (old_profile, new_profile):
        for _, allergen_list in (profile_dict.get("allergies") or {}).items():
            if isinstance(allergen_list, (list, set)):
                all_allergies_set.update(str(a).strip().lower() for a in allergen_list if a)

    print(f"[AllergenFilter] Active allergen set for this request: {sorted(all_allergies_set) or 'none'}")

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

    # ── PRE-EMIT HARD PRICE GUARD ─────────────────────────────────────────────
    # Final unconditional price clamp before <<PRODUCTS>> is emitted.
    # Guarantees zero over-budget items reach the frontend regardless of which
    # code path added them (initial fetch, fallback queries, allergen-filtered pool).
    if budget_limit is not None:
        pre_price_count = len(filtered_products)
        filtered_products = [
            p for p in filtered_products
            if parse_product_price(p.get("price")) <= budget_limit
        ]
        price_dropped = pre_price_count - len(filtered_products)
        if price_dropped:
            print(f"[PriceFilter] Pre-emit guard dropped {price_dropped} over-budget product(s) "
                  f"(limit: LKR {budget_limit}).")
        if not filtered_products:
            yield (f"I couldn't find any products under LKR {int(budget_limit)} matching your search. "
                   f"Try raising your budget or searching a different category!")
            return

    # ── DB-DRIVEN HARD-STOP ALLERGEN PURGE (definitive gate) ──────────────────
    # Right before streaming the product carousel, read the saved profile's
    # allergens and run an absolute, non-LLM Python sweep. This is the last line
    # of the zero-trust guardrail — nothing flagged ever reaches the UI.
    if profile_allergies:
        danger_words = [str(a).lower().strip() for a in profile_allergies if str(a).strip()]
        if danger_words:
            pre_count = len(filtered_products)
            # Scan every text field the live MCP product carries (name, plus the
            # specs/summary that Kapruka returns in place of a "description") so a
            # flagged ingredient anywhere in the listing triggers the purge.
            def _haystack(p: dict) -> str:
                return " ".join(
                    str(p.get(f) or "")
                    for f in ("name", "description", "specs", "summary", "category")
                ).lower()

            filtered_products = [
                p for p in filtered_products
                if not any(kw in _haystack(p) for kw in danger_words)
            ]
            removed = pre_count - len(filtered_products)
            if removed:
                print(
                    f"[HardStop:ProfileAllergenPurge] Removed {removed} product(s) "
                    f"matching profile allergens {danger_words}. "
                    f"{len(filtered_products)} remain."
                )
            if not filtered_products:
                yield (
                    "Hmm, everything I found might not be safe given the allergens "
                    "on file. Let me know a different category and I'll keep them safe!"
                )
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

    if vibe_check and vibe_check.strip():
        context_notes.append(
            f"Recipient vibe/personality: {vibe_check.strip()} — "
            "You MUST explicitly state in 1-2 sentences WHY each product you recommend suits this specific "
            "personality. Reference their traits directly (e.g. 'Since they love coding late into the night, "
            "this [product] is perfect because...'). Do not be generic — connect the product to the vibe."
        )

    context_block = "\n".join(context_notes) if context_notes else ""

    user_content = (
        # Include the raw message FIRST so the LLM can detect the user's language
        # and mirror it exactly — this is the most critical input for language matching.
        f"User's original message (mirror this language exactly in your reply): {user_raw_message}\n\n"
        if user_raw_message else ""
    ) + (
        f"{context_block}\n" if context_block else ""
    ) + (
        f"Recipients: {', '.join(str(r) for r in recipients) if recipients else 'yourself (no recipient named — treat as everyday self-shopping, not a gift)'}\n"
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
