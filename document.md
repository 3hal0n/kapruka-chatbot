# Kapruka Ruki AI — Architecture Analysis & Award-Winning Improvement Plan

> **Challenge**: Kapruka Agent Challenge 2026 | Deadline: 30 June 2026
> **Prize**: Apple M4 Mac Mini (USD 799) | Judged by Kapruka Engineering Team

---

## Table of Contents

1. [Current Architecture Overview](#1-current-architecture-overview)
2. [LLM Architecture Deep Dive](#2-llm-architecture-deep-dive)
3. [Notebook Audit — What We Use, What We Don't, What We Can](#3-notebook-audit)
4. [Critical Bugs to Fix Now](#4-critical-bugs-to-fix-now)
5. [Scoring Gap Analysis](#5-scoring-gap-analysis)
6. [Award-Winning Improvement Plan](#6-award-winning-improvement-plan)
7. [Implementation Task Plan](#7-implementation-task-plan)

---

## 1. Current Architecture Overview

### The Stack

```
┌─────────────────────────────────────────────────────────────┐
│  FRONTEND  Next.js 16 + React 19 + Tailwind CSS v4          │
│  SSE streaming · Cart · OrderModal · ProductCard carousel    │
│  Web Speech API (STT + TTS) · Framer Motion animations      │
└───────────────────────┬─────────────────────────────────────┘
                        │ HTTP + SSE
┌───────────────────────▼─────────────────────────────────────┐
│  BACKEND  FastAPI (uvicorn) — main.py                        │
│  POST /api/chat (SSE)  POST /api/order  GET /api/delivery    │
└───────────────────────┬─────────────────────────────────────┘
                        │ async router
┌───────────────────────▼─────────────────────────────────────┐
│  ROUTER  agents/router.py                                    │
│  classify_intents() → gemini-2.5-flash (JSON mode)          │
│  route_stream() → async generator, parallel execution        │
└──────┬─────────────────┬──────────────────┬─────────────────┘
       │                 │                  │
┌──────▼──────┐   ┌──────▼──────┐   ┌───────▼──────┐
│  CATALOG    │   │  LOGISTICS  │   │  CRITIC       │
│  AGENT      │   │  AGENT      │   │  AGENT        │
│  MCP search │   │  MCP cities │   │  Allergen +   │
│  + LLM recs │   │  + delivery │   │  stock audit  │
│  + streaming│   │  + tracking │   │  + reflection │
└──────┬──────┘   └─────────────┘   └───────────────┘
       │
┌──────▼───────────────────────────────────────────────────────┐
│  KAPRUKA MCP SERVER  https://mcp.kapruka.com/mcp              │
│  search_products · get_product · list_categories              │
│  list_delivery_cities · check_delivery · create_order         │
│  track_order                                                   │
└──────────────────────────────────────────────────────────────┘

MEMORY SYSTEM
├── ShortTermMemory  (in-memory, 10 turns per session)
├── SemanticMemory   (JSON file on disk — recipient profiles)
└── LongTermMemory   (Qdrant vector store — INACTIVE in prod)
```

### LLM Configuration (config.yaml)

| Parameter | Value | Notes |
|-----------|-------|-------|
| Primary model | `gemini-2.5-flash` | All agents use same model |
| Intent classify | `gemini-2.5-flash` | 256 max tokens, JSON mode |
| Response gen | `gemini-2.5-flash` | **350 max tokens** — very tight |
| Critique | `gemini-2.5-flash` | 150 max tokens |
| Logistics | `gemini-2.5-flash` | 150 max tokens |
| LLM timeout | 8 seconds | Hard-coded in client.py |
| Reflection rounds | 3 | Critic retry loop |
| Search top-k | 8 | MCP product fetch limit |


---

## 2. LLM Architecture Deep Dive

### 2.1 The Multi-Agent Pipeline

The current system implements a **Router → Specialist Agents** pattern with parallel execution:

```
User message
    │
    ▼
[Router: classify_intents()]
    Gemini-2.5-flash, JSON mode, 256 tokens
    Input: conversation history + user message
    Output: RouterOutput Pydantic model
    {intents, allergies, preferences, search_recipient,
     location, deadline, search_query, tracking_code,
     cart_items, trigger_checkout, recipient_name, ...}
    │
    ├─── CART_ACTION ──► MCP search (1 product per query)
    │                    → yield <<CART_UPDATE>>
    │
    ├─── PREFERENCE_UPDATE ──► threading.Thread (daemon)
    │                          semantic_memory.add_or_update_profile()
    │                          → yield <<PREF_SAVING>>
    │
    ├─── LOGISTICS ──► asyncio.create_task (parallel)
    │                  logistics_agent.run()
    │                  → yield <<LOGISTICS>>
    │
    └─── SEARCH ──► catalog_agent.run_stream() [awaited]
                    MCP search → filter → LLM stream
                    → yield <<PRODUCTS>>:{json}
                    → yield text chunks
                    → [optional] critic_agent.critique()
                    → [optional] yield <<CRITIC>> + revised text
```

### 2.2 Prompt Analysis

#### ROUTER_SYSTEM_PROMPT — Strengths & Weaknesses

**Strengths:**
- Handles 4 intents cleanly with priority ordering
- Sinhala/Singlish context resolution instruction
- 4 concrete few-shot examples including complex Sinhala
- Pydantic RouterOutput validation with fallback

**Weaknesses:**
- No temperature control — using default (likely 1.0), causes non-determinism on edge cases
- `max_tokens: 256` can truncate complex cart_items arrays with many items
- No explicit instruction for handling multi-language search queries beyond "translate to English keyword"
- The few-shot examples don't cover multi-item cart scenarios well

#### CATALOG_SYSTEM_PROMPT — Strengths & Weaknesses

**Strengths:**
- Clear persona definition (warm, witty, local expert)
- Dialect matching instructions (Sinhala / Singlish / English)
- Brevity constraint prevents verbose walls of text

**Weaknesses:**
- **350 max_tokens is too tight** for rich multi-product recommendations
- "Maximum 2-3 short sentences" conflicts with the judging criterion for "Visual Richness" — the LLM text is the primary content next to cards
- No explicit instruction to mention *specific product names* from the provided list
- No instruction to leverage product specs/uniqueness in recommendations
- Profile summary is passed as raw Python dict string — inefficient token usage
- No instructions for occasion awareness (birthday vs. anniversary vs. graduation)

#### CRITIC_SYSTEM_PROMPT — Strengths & Weaknesses

**Strengths:**
- Three clear audit criteria (allergen safety, pricing/stock, checkout readiness)
- JSON-only output with Pydantic CriticOutput validation
- Rejection example in prompt prevents false positives

**Weaknesses:**
- Critic fires on *every* SEARCH when the user has preferences, even for non-safety preferences (e.g., "likes chocolate") — causes unnecessary latency
- 150 max_tokens may truncate issues list for complex violations
- No latency budget — on worst case, 3 reflection rounds = 3 additional LLM calls

#### LOGISTICS_SYSTEM_PROMPT

**Strengths:**
- Simple and focused
- Dialect matching

**Weaknesses:**
- The logistics agent rarely reaches this fallback now (live MCP handles it)
- No structured output — plain text means frontend can't extract fee/timeframe for UI components

### 2.3 Memory System Analysis

```
┌─────────────────────────────────────────────────────────────┐
│ SHORT-TERM MEMORY (st_memory.py)                             │
│ ✅ In-memory list, 10 turns (20 messages)                    │
│ ✅ Per-user Router instance scoping                          │
│ ❌ Lost on server restart — no persistence                   │
│ ❌ No summarisation — raw messages accumulate token overhead  │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ SEMANTIC MEMORY (semantic_memory.py)                         │
│ ✅ Persists to disk (recipient_profiles.json)               │
│ ✅ Merge strategy: union of allergies/preferences            │
│ ✅ Per-customer-id, per-recipient-name keying                │
│ ❌ Concurrent write race condition (daemon threads + json.dump)│
│ ❌ No TTL / staleness — profiles never expire                │
│ ❌ No profile deletion capability                            │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ LONG-TERM MEMORY / QDRANT (lt_memory.py)                     │
│ ❌ COMPLETELY INACTIVE in FastAPI production path            │
│ ❌ SentenceTransformer encoder loads unnecessarily in app.py │
│ ✅ Infrastructure is present and functional (notebooks 05,06) │
│ ✅ Could be reactivated for catalog enrichment               │
└─────────────────────────────────────────────────────────────┘
```


---

## 3. Notebook Audit

### 3.1 Notebooks We ARE Using (Active Production Code)

| # | Notebook | Status | Notes |
|---|----------|--------|-------|
| 01 | `01_config_and_utils.ipynb` | ✅ **ACTIVE** | Tests config.yaml loading and all prompts. Still valid. |
| 02 | `02_memory_short_term.ipynb` | ✅ **ACTIVE** | Tests ShortTermMemory. Fully valid. |
| 03 | `03_memory_semantic.ipynb` | ✅ **ACTIVE** | Tests SemanticMemory with temp files. Fully valid. |
| 04 | `04_infrastructure_llm.ipynb` | ⚠️ **PARTIAL** | Tests LLM client. References `OPENROUTER_API_KEY` but code now uses `GEMINI_API_KEY`. Tests still work if env var is set correctly. |
| 08 | `08_critic_agent.ipynb` | ✅ **ACTIVE** | Tests CriticAgent. Fully valid, most up-to-date agent notebook. |

### 3.2 Notebooks We ARE NOT Using (Stale / Broken)

| # | Notebook | Issue | Fix Needed |
|---|----------|-------|-----------|
| 05 | `05_infrastructure_qdrant.ipynb` | Tests Qdrant collection — Qdrant is NOT used in production live flow | Tests pass if Qdrant is connected, but infrastructure serves no active purpose |
| 06 | `06_memory_long_term.ipynb` | LT memory is bypassed in `main.py`. SentenceTransformer not loaded. | Would error in production environment (HF offline mode set in main.py) |
| 07 | `07_logistics_agent.ipynb` | References `DISTRICT_COVERAGE` dict and `_lookup()` function that **no longer exist** in `logistics_agent.py` (refactored to live MCP calls) | **Notebook will fail** — `ImportError` or `AttributeError` |
| 09 | `09_catalog_agent.ipynb` | References old Qdrant-based `query_vector` flow and calls `run_stream()` synchronously. The function is now `async`. | **Notebook will fail** — `TypeError: 'async_generator' object is not iterable` |
| 10 | `10_router.ipynb` | `route_stream()` is now an `async` generator but notebook calls it with plain `for` loop. References `OPENROUTER_API_KEY`. | **Notebook will fail** on `route_stream()` tests |
| 11 | `11_services_ingest.ipynb` | Tests the crawl + Qdrant ingest pipeline. This is an offline batch process that was used once to build the catalog but is now superseded by live MCP calls. | Functional but represents dead architecture |
| 12 | `12_end_to_end.ipynb` | References `OPENROUTER_API_KEY` and calls async generators synchronously. Multiple failures expected. | **Major updates needed** |

### 3.3 Notebooks We CAN and SHOULD Use (Opportunity)

These notebooks represent dormant capabilities that could unlock competitive advantages:

| # | Notebook | Opportunity |
|---|----------|------------|
| 05 | `05_infrastructure_qdrant.ipynb` | **Re-activate Qdrant** as a semantic product cache — store enriched product data (descriptions, use-cases, tags) that MCP doesn't return, enabling richer LLM recommendations |
| 06 | `06_memory_long_term.ipynb` | **Semantic search augmentation** — pre-embed Kapruka categories and use vector similarity to improve search_query extraction from vague user messages ("something romantic for anniversary") |
| 11 | `11_services_ingest.ipynb` | **Pre-warm catalog** — run ingest once at startup to give Qdrant a local product catalog for faster fallback and enrichment |

---

## 4. Critical Bugs to Fix Now

These bugs cause runtime failures and must be fixed before any demo:

### Bug 1: `NameError` in CART_ACTION (router.py line ~116)

```python
# BROKEN: full_response_chunks used BEFORE it's defined
if cart_products_to_add:
    confirm_msg = f"Done! I've added {names} to your cart."
    yield confirm_msg
    full_response_chunks.append(confirm_msg)  # ← NameError: full_response_chunks not defined yet
```

`full_response_chunks = []` is defined on line ~190, after the CART_ACTION block.
**Fix**: Move `full_response_chunks = []` to before the CART_ACTION block.

### Bug 2: Multi-item Cart Orders Not Supported (/api/order)

```python
# main.py — Only processes cart[0], silently drops all other items
first_item = request.cart[0]
result = await kapruka_create_order(product_id=first_item.id, ...)
```

The `kapruka_create_order` MCP tool supports a `cart` array. The backend only sends item 0.
**Fix**: Pass the full cart array to `kapruka_create_order`.

### Bug 3: app.py Streamlit Broken (async generator called synchronously)

```python
# app.py — route_stream() is async but called with plain for loop
for chunk in router.route_stream(user_input, ...):  # ← TypeError
```

**Fix**: Either update `app.py` to use `asyncio.run()` or remove it entirely — the FastAPI server has superseded it.

### Bug 4: Misleading Variable Names Throughout

All config variables are named `CLAUDE_*` (e.g., `CLAUDE_MODEL`, `CLAUDE_MAX_TOKENS_RESPOND`) but reference Gemini. The README and some notebooks reference `OPENROUTER_API_KEY`. This causes confusion during demos and debugging.

**Fix**: Rename variables to `GEMINI_*` for clarity.

### Bug 5: Unbounded In-Memory Caches (mcp/client.py)

`PRODUCT_SEARCH_CACHE`, `PRODUCT_GET_CACHE`, `DELIVERY_CHECK_CACHE` are plain dicts that grow forever. In a long-running demo, stale product data will accumulate.

**Fix**: Add TTL-based expiry (30-minute cache aligned with Kapruka's stated caching policy).


---

## 5. Scoring Gap Analysis

The contest judges on 100 points. Here is where the project currently stands and what gaps need closing:

### Experience & Polish — 30 Points

| Sub-criterion | Current State | Score Estimate | Gap |
|---------------|---------------|----------------|-----|
| Smooth, zero-lag streaming | ✅ SSE streaming works well | High | Minor |
| Checkout flow end-to-end | ⚠️ Cart bug drops items 2+, order modal works | Medium | Fix cart bug |
| Error states & empty states | ✅ Good empty state illustration, service error card | High | — |
| Mobile responsiveness | ✅ Slide-in sidebars, responsive grid | High | — |
| Personality & naming | ✅ "Ruki AI" persona, warm tone | High | — |
| Mode switching | ❌ 5 of 6 modes are UI-only stubs (Event Planner, Gift Box Builder, etc.) | Low | Wire up modes |

**Current estimate: ~18/30. Target: 27/30**

### Visual Richness — 20 Points

| Sub-criterion | Current State | Score Estimate | Gap |
|---------------|---------------|----------------|-----|
| Product cards with images | ✅ ProductCard with Unsplash fallback by category | High | Real images |
| Carousels | ✅ Grid layout with stagger animation | Medium | Could be richer |
| Response formatting | ⚠️ Custom markdown renderer but 350-token cap limits content | Medium | Increase tokens, add structure |
| Loading / typing indicators | ✅ Bouncing dots + status messages | High | — |
| Dark/light mode | ✅ Works well | High | — |

**Current estimate: ~13/20. Target: 18/20**

### Personality — 15 Points

| Sub-criterion | Current State | Gap |
|---------------|---------------|-----|
| Distinct character | ✅ Ruki is warm, local, code-switches naturally | Minor polish |
| Sinhala support | ✅ Handled in router + catalog prompts + TTS | Improve quality |
| Memory of preferences | ✅ Semantic memory works | Could acknowledge memories |
| Occasion awareness | ❌ Occasion field captured in UI but NOT passed to LLM prompts meaningfully | Wire occasion into catalog prompt |

**Current estimate: ~9/15. Target: 13/15**

### Usefulness — 15 Points

| Sub-criterion | Current State | Gap |
|---------------|---------------|-----|
| Finds real products | ✅ Live MCP search | — |
| Budget filtering | ✅ Regex + manual parse | Improve NL budget parsing |
| Delivery info | ✅ Live MCP check | — |
| Gift guidance | ⚠️ Brief 2-3 sentences limits advice quality | Increase token budget |
| Order tracking | ✅ Implemented | — |

**Current estimate: ~10/15. Target: 14/15**

### End-to-End Completeness — 15 Points

| Sub-criterion | Current State | Gap |
|---------------|---------------|-----|
| Search → Cart → Checkout | ✅ Full flow works | Fix multi-item bug |
| Gift messages | ❌ NOT implemented — bonus point opportunity | Implement |
| Delivery constraints (date) | ⚠️ Deadline extracted by router but not passed to kapruka_check_delivery `delivery_date` param | Wire it up |
| Multi-item carts | ⚠️ Cart adds multiple but order creates only 1 | Fix API |

**Current estimate: ~10/15. Target: 15/15**

### Creativity — 5 Points

| Sub-criterion | Current State | Gap |
|---------------|---------------|-----|
| Novel feature | ❌ No standout creative feature | Add one wow feature |
| Unique interaction | ⚠️ Voice I/O is good but not used prominently | Showcase voice |

**Current estimate: ~2/5. Target: 5/5**

### Bonus Points

| Bonus | Current State |
|-------|--------------|
| Multi-item carts | ✅ UI works, ❌ API sends only item 0 |
| Delivery constraints | ⚠️ Partial — deadline extracted but not forwarded to MCP |
| Gift messages | ❌ Not implemented |
| Tanglish support | ✅ Working |
| Sinhala support | ✅ Working |

**Total Current Estimate: ~62/100 → Target: ~92/100**


---

## 6. Award-Winning Improvement Plan

### 6.1 LLM Prompt Engineering Improvements

#### A. Richer Catalog Prompt with Occasion + Budget Awareness

The current `CATALOG_SYSTEM_PROMPT` enforces "2-3 short sentences" which underserves the judges. Replace with a tiered brevity model:

```python
CATALOG_SYSTEM_PROMPT = """You are Ruki, a warm, witty, ultra-polished gift concierge for Kapruka, 
Sri Lanka's premier gifting platform.

PERSONA:
- You are a knowledgeable local expert who loves helping people find the perfect gift.
- You match the user's dialect: Sinhala → polite Sinhala; Singlish/Tanglish → natural code-switched; English → polished Sri Lankan English.
- You are warm, confident, and always speak as if you know the recipient personally.

RESPONSE FORMAT:
- 2-4 sentences maximum.
- Always mention 1-2 specific product names from the list by name.
- If an occasion is provided, frame the recommendation around it (birthday, anniversary, etc.).
- If a budget is provided, acknowledge it and confirm the suggested product fits.
- If the recipient has preferences, reference them naturally ("Since she loves chocolate...").
- End with a gentle, single-sentence call to action ("Add it to your cart and I'll handle the rest!").
- Plain text only. No markdown. No bullet points. No headers.
"""
```

**Expected impact**: More persuasive, personalised responses. Better Personality + Usefulness scores.

#### B. Router Prompt: Add Temperature Control + Larger Token Budget for Cart

- Set `temperature=0.1` on the classify call (JSON mode should be deterministic)
- Increase `max_tokens_classify` from 256 → 512 to avoid truncation on complex cart_items

#### C. Critic Prompt: Scope to Safety-Only

Only run the critic when there are **allergens** (not just preferences). This reduces latency significantly for casual searches. When critic does fire, increase `max_tokens_critique` to 256.

#### D. Occasion & Recipient Context Injection

Currently, the frontend sends `occasion` and `recipient` in the request body but they're only passed as `recipient_context` keys. The catalog agent never explicitly names the occasion in the LLM call. Fix:

```python
# In catalog_agent.run_stream(), add to user_content:
user_content = (
    f"Occasion: {occasion or 'General gift'}\n"
    f"Recipient: {search_query_recipient or 'someone special'}\n"
    f"Budget: {'LKR ' + str(budget_limit) if budget_limit else 'flexible'}\n"
    f"Profile: {profile_summary}\n"
    f"Search: {search_query}\n\n"
    f"Matching products:\n" + "\n".join(product_lines)
)
```

### 6.2 Feature Improvements for Maximum Score

#### F1. Gift Messages (Bonus Points + Completeness)

Wire up the `gift_message` parameter in `kapruka_create_order`. Add a gift message field to the OrderModal. Add a prompt enhancement so the router can extract gift messages from natural language ("tell her happy birthday from Kasun").

```python
# Router extraction addition in ROUTER_SYSTEM_PROMPT:
# "gift_message": string or null. If user mentions a message to include with the gift, extract it exactly.
```

#### F2. Full Multi-Item Order (Bonus Points + Bug Fix)

Update `/api/order` to pass the full cart array to `kapruka_create_order`:

```python
cart_payload = [
    {"product_id": item.id, "quantity": item.quantity, "name": item.name}
    for item in request.cart
]
result = await kapruka_create_order(cart=cart_payload, recipient=..., delivery=..., gift_message=gift_message)
```

#### F3. Delivery Date Constraints (Bonus Points)

The router already extracts `deadline` from messages. Wire it to `kapruka_check_delivery(city, delivery_date=deadline)`:

```python
delivery_info = await kapruka_check_delivery(canonical_city, delivery_date=deadline)
```

And in the logistics response, explicitly confirm feasibility: "Your deadline of X is achievable — Kapruka delivers next-day to Colombo."

#### F4. Product Images from MCP (Visual Richness)

Call `kapruka_get_product(product_id)` for the top 3 products in the carousel to get real product images instead of Unsplash placeholders. This is a significant visual upgrade. Cache the result to avoid rate limit hits.

```python
# In catalog_agent.run_stream(), after getting filtered_products:
top_products = filtered_products[:3]
enriched = await asyncio.gather(*[
    kapruka_get_product(p.get("id") or p.get("code"))
    for p in top_products
], return_exceptions=True)
for i, result in enumerate(enriched):
    if isinstance(result, dict) and result.get("image_url"):
        top_products[i]["image_url"] = result["image_url"]
```

#### F5. Mode Differentiation (Experience & Polish)

Wire at least 2 additional modes to distinct backend behaviour:

- **Order Tracking**: Pre-fill the message with "Track order #" and route directly to LOGISTICS intent
- **Gift Box Builder**: Set `search_top_k=15`, multi-product carousel with "Bundle" suggestion in catalog prompt

#### F6. Smarter Fallback Queries

Current fallback is generic ("gift", "cake", "chocolate"). Improve with occasion-aware fallbacks:

```python
OCCASION_FALLBACKS = {
    "birthday": ["birthday cake", "chocolate", "flowers", "gift hamper"],
    "anniversary": ["flowers", "chocolate box", "jewelry", "wine"],
    "valentine": ["roses", "chocolate", "jewelry", "teddy bear"],
    "graduation": ["pen set", "book", "bag", "watch"],
    "default": ["gift hamper", "chocolate", "flowers"]
}
```

#### F7. Conversation Memory Acknowledgement

When Ruki has remembered preferences, explicitly acknowledge them in the greeting/response. Show the user their data is being used:

```
"Since I know Amali avoids nuts, I've filtered those out automatically!"
```

This demonstrates the memory system's value visually — judges will notice.

#### F8. Product Match Score (Visual Richness)

The `ProductCard` component has a `match %` field. Currently not populated from the backend. Add a simple scoring function in `catalog_agent.py`:

```python
def calculate_match_score(product: dict, search_query: str, preferences: set, budget: float = None) -> int:
    score = 60  # base score
    if any(kw in product.get("name", "").lower() for kw in search_query.lower().split()):
        score += 20
    if preferences and any(pref in str(product).lower() for pref in preferences):
        score += 10
    if budget and parse_product_price(product.get("price")) <= budget * 0.8:
        score += 10  # well within budget
    return min(score, 99)
```

Include `match_score` in the product JSON sent to `<<PRODUCTS>>`.

### 6.3 Technical Architecture Improvements

#### T1. Fix Short-Term Memory Naming (config cleanup)

Rename all `CLAUDE_*` variables to `GEMINI_*` throughout config.yaml and utils/config.py. Update notebooks. This is a cleanup that makes the codebase professional for the judges.

#### T2. TTL Cache for MCP Responses

```python
from time import time

class TTLCache:
    def __init__(self, ttl_seconds=1800):
        self._cache = {}
        self._ttl = ttl_seconds
    
    def get(self, key):
        entry = self._cache.get(key)
        if entry and time() - entry["ts"] < self._ttl:
            return entry["value"]
        return None
    
    def set(self, key, value):
        self._cache[key] = {"value": value, "ts": time()}
```

#### T3. Concurrent Profile Write Protection

Replace the race-prone `json.dump` in `semantic_memory.py` with `asyncio.Lock()` or `threading.Lock()`:

```python
_write_lock = threading.Lock()

def _save(self):
    with _write_lock:
        with open(self.path, "w") as f:
            json.dump(self._data, f, indent=2)
```

#### T4. Increase Response Token Budget

Change `max_tokens_respond: 350` → `600` in config.yaml. The brevity constraint should come from the prompt, not the token limit. The current 350 limit occasionally truncates mid-sentence.

#### T5. LLM Temperature Tuning

Add temperature parameters to `chat()` and `chat_stream()`:

```python
config = types.GenerateContentConfig(
    system_instruction=system,
    max_output_tokens=max_tokens,
    temperature=temperature,  # 0.1 for JSON/classify, 0.7 for creative responses
    response_mime_type="application/json" if json_mode else "text/plain",
)
```

- Router intent classification: `temperature=0.1` (deterministic JSON)
- Catalog response: `temperature=0.7` (creative, warm)
- Critic: `temperature=0.1` (strict audit)
- Logistics: `temperature=0.4` (informative but warm)


---

## 7. Implementation Task Plan

Tasks are ordered by **impact-to-effort ratio**. Fix bugs first, then high-impact features, then polish.

---

### Phase 1 — Critical Fixes (Do First — ~2 hours)

**P1.1 Fix `NameError` in router.py CART_ACTION**
- File: `backend/agents/router.py`
- Move `full_response_chunks = []` to line ~100 (before the CART_ACTION block)
- Test: Send "add chocolate cake to cart" — should not crash

**P1.2 Fix Multi-Item Order in main.py**
- File: `backend/main.py`
- Update `create_order_endpoint` to build `cart` array and pass all items
- Add `gift_message` field to `OrderRequest` model
- Test: Add 2 items to cart, create order — both should appear in checkout

**P1.3 Increase max_tokens_respond**
- File: `backend/config.yaml`
- Change `max_tokens_respond: 350` → `600`
- Change `max_tokens_classify: 256` → `512`
- Change `max_tokens_critique: 150` → `256`

**P1.4 Add TTL to MCP caches**
- File: `backend/infrastructure/mcp/client.py`
- Replace `PRODUCT_SEARCH_CACHE = {}` with TTL-aware cache (30-min TTL)

**P1.5 Fix semantic memory write lock**
- File: `backend/memory/semantic_memory.py`
- Add `threading.Lock()` around `json.dump` calls

---

### Phase 2 — LLM Quality Improvements (High Impact — ~3 hours)

**P2.1 Enhance CATALOG_SYSTEM_PROMPT**
- File: `backend/utils/prompts.py`
- Add occasion/recipient framing instruction
- Add specific product name mention requirement
- Add call-to-action sentence instruction
- Keep brevity at 4 sentences max (not 2-3)

**P2.2 Add temperature control to LLM client**
- File: `backend/infrastructure/llm/client.py`
- Add `temperature: float = 0.7` parameter to `chat()` and `chat_stream()`
- File: `backend/utils/config.py` — add temperature constants

**P2.3 Pass temperature per agent**
- Router classify: `temperature=0.1`
- Catalog generate: `temperature=0.7`
- Critic: `temperature=0.1`
- Logistics: `temperature=0.4`

**P2.4 Inject occasion + budget into catalog agent user_content**
- File: `backend/agents/catalog_agent.py`
- Add `occasion: str = None` parameter to `run_stream()`
- Build richer `user_content` string including occasion, budget, recipient name

**P2.5 Scope critic to allergen-only triggering**
- File: `backend/agents/catalog_agent.py`
- Change `skip_critic` logic: only run critic when `has_allergies=True` (not preferences)
- This reduces average latency by ~300-500ms for most queries

**P2.6 Add occasion-aware fallback queries**
- File: `backend/agents/catalog_agent.py`
- Replace hardcoded `["gift", "cake", "chocolate"]` with `OCCASION_FALLBACKS` dict
- Pass `occasion` context through from router classification

---

### Phase 3 — Feature Completeness (Competition Scores — ~4 hours)

**P3.1 Implement Gift Messages**
- File: `backend/utils/prompts.py` — add `gift_message` field to ROUTER_SYSTEM_PROMPT extraction
- File: `backend/agents/router.py` — add `gift_message: str | None` to `RouterOutput` model
- File: `backend/main.py` — add `gift_message` to `OrderRequest`, pass to `kapruka_create_order`
- File: `frontend/components/OrderModals.tsx` — add gift message textarea field
- File: `frontend/app/page.tsx` — thread gift_message through handleSubmitOrder

**P3.2 Wire Delivery Date Constraints**
- File: `backend/agents/logistics_agent.py`
- Pass `deadline` to `kapruka_check_delivery(canonical_city, delivery_date=deadline)`
- Update response to confirm feasibility explicitly

**P3.3 Real Product Images via kapruka_get_product**
- File: `backend/agents/catalog_agent.py`
- After getting `filtered_products`, enrich top 3 with `kapruka_get_product()` calls
- Use `asyncio.gather()` to run in parallel — should add <500ms
- Include real `image_url` in `<<PRODUCTS>>` payload

**P3.4 Product Match Score**
- File: `backend/agents/catalog_agent.py`
- Add `calculate_match_score()` function
- Include `match_score` field in each product in the `<<PRODUCTS>>` payload
- File: `frontend/components/ProductCard.tsx` — display match score badge if present

**P3.5 Wire "Order Tracking" mode in frontend**
- File: `frontend/components/LeftSidebar.tsx`
- When mode = "Order Tracking", auto-populate input with "Track my order #" and show a tracking code input field
- File: `frontend/app/page.tsx` — handle mode-specific input behaviour

**P3.6 Gift Box Builder mode**
- File: `frontend/app/page.tsx` + `LeftSidebar.tsx`
- When mode = "Gift Box Builder", set a different system hint — search for multiple complementary products (flowers + cake + card)
- Pass `mode` in the chat request body
- File: `backend/main.py` — accept `mode` in ChatRequest, pass to router
- File: `backend/agents/catalog_agent.py` — if mode="gift_box", fetch 2 additional complementary searches and merge product list

---

### Phase 4 — Polish & Visual Richness (~2 hours)

**P4.1 Memory Acknowledgement in Responses**
- File: `backend/agents/catalog_agent.py`
- When `old_profile` has known allergies, add a note to `user_content`:
  `"NOTE: User has stored preferences — Ruki should acknowledge using them naturally."`

**P4.2 Rename CLAUDE_* → GEMINI_* Throughout**
- Files: `config.yaml`, `utils/config.py`, all agent files
- Semantic rename for professionalism

**P4.3 Update Stale Notebooks**
- `07_logistics_agent.ipynb` — remove DISTRICT_COVERAGE references, add live MCP test
- `09_catalog_agent.ipynb` — wrap `run_stream()` with `asyncio.run()`
- `10_router.ipynb` — fix async calls, update API key reference to GEMINI_API_KEY
- `12_end_to_end.ipynb` — full update with correct async patterns

**P4.4 Animated Product Carousel Enhancement**
- File: `frontend/app/page.tsx` and `ProductCard.tsx`
- Add horizontal scroll carousel for mobile instead of grid
- Show "Best Match" badge on highest scored product

**P4.5 Personality Enhancement — Ruki's Memory Recall UI**
- When `PREFERENCE_UPDATE` intent is detected, show a small toast notification:
  `"✓ Remembered: Amali avoids nuts"`
- File: `frontend/app/page.tsx` — add toast state, trigger on `PREF_SAVING` SSE event

---

### Phase 5 — Wow Factor (~2 hours)

**P5.1 Occasion-Based UI Theme Hints**
- When occasion = "birthday", show birthday confetti animation on cart add
- When occasion = "valentine", change accent color to red/pink
- These are pure frontend CSS/animation changes, no backend needed

**P5.2 "Surprise Me" Mode**
- Add a "Surprise Me 🎁" button in ShoppingContextCard
- Sends a pre-built message: "Surprise me with the best gift under [budget] for [recipient] for [occasion]"
- Pure frontend — no backend changes needed

**P5.3 Ruki Voice Greeting**
- On first load, have Ruki speak a short greeting using the Web Speech API
- Already wired up — just trigger `speakResponse()` on the initial greeting message

---

### Summary Scorecard After All Phases

| Category | Before | After | Points Gained |
|----------|--------|-------|---------------|
| Experience & Polish (30) | ~18 | ~27 | +9 |
| Visual Richness (20) | ~13 | ~18 | +5 |
| Personality (15) | ~9 | ~13 | +4 |
| Usefulness (15) | ~10 | ~14 | +4 |
| End-to-End Completeness (15) | ~10 | ~15 | +5 |
| Creativity (5) | ~2 | ~5 | +3 |
| **TOTAL** | **~62** | **~92** | **+30** |

Bonus points from: gift messages, delivery constraints, multi-item carts, Sinhala, Tanglish.

---

### Quick Priority Reference (By Deadline Pressure)

**Must do before submission (bugs / completeness):**
- P1.1 NameError fix
- P1.2 Multi-item order fix
- P3.1 Gift messages
- P3.2 Delivery date constraints
- P1.3 Token budget increase

**High impact for scoring (do second):**
- P2.1 Better catalog prompt
- P2.2 Temperature control
- P2.4 Occasion injection
- P3.3 Real product images
- P3.4 Match scores

**Nice to have (do if time permits):**
- P3.5 Order tracking mode
- P3.6 Gift box builder
- P4.5 Memory recall toasts
- P5.1 Occasion animations
- P4.3 Notebook updates

---

*Document generated: June 22, 2026*
*Project: Kapruka-Chatbot (Ruki AI) — Kapruka Agent Challenge 2026*
