# agents/catalog_agent.py

import json
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


def run_stream(recipients: set, search_query: str, old_profile: dict, new_profile: dict,query_vector : list = None):


    # Search catalog
    products = search_catalog(search_query, top_k=CATALOG_SEARCH_TOP_K,query_vector=query_vector)
    if not products:
        yield "Sorry! I couldn't find anything matching right now. Could you try describing the gift differently?"
        return
    
    # Yield products as metadata token
    yield f"<<PRODUCTS>>:{json.dumps(products)}"
    
    #print(f'products : {products} type of products : {type(products)}')

    product_lines = [
        f"- {p.get('name', 'Unknown')} | Price: {p.get('price', 'N/A')} "
        f"| Category: {p.get('category', 'N/A')} | Stock: {p.get('availability', 'Unknown')} "
        f"| Specs: {p.get('specs', 'N/A')}"
        for p in products
    ]


    allergies = {}
    preferences = {}
    location = {}
    for res in recipients:
        allergies[res]   = set((old_profile["allergies"].get(res, []) or []) + (new_profile["allergies"].get(res, []) or []))
        preferences[res] = set((old_profile["preferences"].get(res, []) or []) + (new_profile["preferences"].get(res, []) or []))
        location[res]    = old_profile.get("location", {}).get(res, "") or new_profile.get("location", {}).get(res, "")



    profile_summary = {"allergies": allergies, "preferences": preferences, "location": location}

    user_content = (
        f"{profile_summary}\n"
        f"Search: {search_query}\n\n"
        f"Matching products:\n" + "\n".join(product_lines)
    )

    # 1. Stream draft — collect full text while yielding chunks
    draft_chunks = []
    for chunk in _generate_stream(user_content):
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
    critique = critic_agent.critique(
        recommendation=draft,
        search_query=search_query,
        profile=profile_summary,
        recipients=recipients or "",
        products=products
    )

    if critique.get("approved") == True:
        print("Critic Approved.")
        return


    #reflection pattern
    rounds = 0
    revised = draft
    

    while((critique.get("approved") == False) and (rounds < MAX_REFLECTION_ROUNDS)):
        issues = critique.get("issues", [])
        suggestion = critique.get("suggestion", "")

        content = (
            f"Original recommendation:\n{revised}\n\n"
            f"Issues found:\n" + "\n".join(f"- {i}" for i in issues) +
            f"\n\nSuggested fix:\n{suggestion or 'Address the issues above.'}"
        )

        yield "<<CRITIC>>"  #wipes the draft from the ui

        # Collect silently — no yielding yet
        revised_chunks = []
        for chunk in chat_stream(
            system=REVISE_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": content}],
            max_tokens=CLAUDE_MAX_TOKENS_RESPOND,
            model=CLAUDE_MODEL,
        ):
            revised_chunks.append(chunk)
            yield chunk

        revised = "".join(revised_chunks)

        critique = critic_agent.critique(
            recommendation=revised,
            search_query=search_query,
            profile=profile_summary,
            recipients=recipients or "",
            products=products
        )
        rounds += 1
