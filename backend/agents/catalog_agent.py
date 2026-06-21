# agents/catalog_agent.py

import json
import asyncio
from memory.lt_memory import search_catalog
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


def filter_allergens(products: list, recipient_allergies: set) -> list:
    """Filter out products that match recipient allergies in name, specs, or category."""
    filtered = []
    allergies_clean = [str(a).strip().lower() for a in recipient_allergies if a]
    
    for p in products:
        name = str(p.get("name") or "").lower()
        specs = str(p.get("specs") or "").lower()
        category = str(p.get("category") or "").lower()
        
        has_allergen = False
        for allergy in allergies_clean:
            if not allergy:
                continue
            if allergy in name or allergy in specs or allergy in category:
                has_allergen = True
                print(f"Deterministic Filter: Excluded '{p.get('name')}' due to allergen '{allergy}'")
                break
        if not has_allergen:
            filtered.append(p)
    return filtered


async def run_stream(recipients: set, search_query: str, old_profile: dict, new_profile: dict, query_vector: list = None):
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

    # Yield filtered products as metadata token
    yield f"<<PRODUCTS>>:{json.dumps(filtered_products)}"

    product_lines = [
        f"- {p.get('name', 'Unknown')} | Price: {p.get('price', 'N/A')} "
        f"| Category: {p.get('category', 'N/A')} | Stock: {p.get('availability') or p.get('stock') or 'Unknown'} "
        f"| Specs: {p.get('specs', 'N/A')} | Checkout Ready: {p.get('checkout_ready', True)}"
        for p in filtered_products
    ]

    profile_summary = {"allergies": allergies, "preferences": preferences, "location": location}

    user_content = (
        f"{profile_summary}\n"
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

    # 2. Check if critic needed
    skip_critic = not profile_summary.get("allergies") and not profile_summary.get("preferences")
    if skip_critic:
        print("[Critic] Skipped — no constraints.")
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
