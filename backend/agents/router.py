import json
import concurrent.futures
import threading
from memory.st_memory import ShortTermMemory
from memory.semantic_memory import add_or_update_profile, get_profile
from agents import catalog_agent, logistics_agent
from utils.config import CLAUDE_MODEL_CLASSIFY, CLAUDE_MAX_TOKENS_CLASSIFY
from utils.prompts import ROUTER_SYSTEM_PROMPT
from infrastructure.llm.client import chat, LLMUnavailableError
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
    # Cart removal operations ("remove the roses", "clear my cart")
    cart_remove_items: list[CartItemQuery] | None = None
    clear_cart: bool | None = False
    trigger_checkout: bool | None = False
    recipient_name: str | None = None
    delivery_address: str | None = None
    contact_number: str | None = None
    gift_message: str | None = None     # verbatim greeting card / gift note text



class Router:
    def __init__(self, customer_id: str):
        self.customer_id = customer_id
        self.st_memory = ShortTermMemory()
        # Products from the most recent carousel shown to this user. Follow-up
        # cart commands ("add that", "add the 50 red roses one", "add the first")
        # resolve against what the user is actually looking at — a fresh MCP
        # keyword search for the same words routinely returns a DIFFERENT item.
        self.last_products: list[dict] = []
        # Composed gift-card message riding along with the cart payload state.
        self.pending_gift_message: str | None = None

    def snapshot(self) -> dict:
        """Serializable snapshot of the three per-session mutable fields.
        Called after each completed turn to persist to Postgres."""
        return {
            "history": self.st_memory.history,
            "last_products": self.last_products,
            "pending_gift_message": self.pending_gift_message,
        }

    def restore(self, data: dict) -> None:
        """Hydrate from a DB-loaded snapshot on a cold instance / cache miss."""
        self.st_memory.history = list(data.get("history") or [])
        self.last_products = list(data.get("last_products") or [])
        self.pending_gift_message = data.get("pending_gift_message")

    def _detect_cart_action(self, user_message: str) -> dict | None:
        """
        Pre-LLM regex interceptor for unambiguous cart/purchase commands.

        If the message matches any known cart-action pattern, return a forced
        CART_ACTION classification directly — no LLM call needed.  This prevents
        the LLM from mis-routing explicit action phrases as SEARCH intents.

        Returns a complete classification dict on match, or None to fall through
        to the LLM classifier.
        """
        msg = user_message.strip().lower()

        import re as _re

        # If the message ALSO contains an explicit search request for a different
        # product ("and then find roses", "also show me X"), fall through to the LLM
        # so it can return a combined CART_ACTION + SEARCH classification.
        if _re.search(
            r'\b(?:and\s+(?:then\s+)?(?:find|show|search|look\s+for)|also\s+(?:find|show|search)|plus\s+(?:find|show))\b',
            msg
        ):
            return None

        # ── Cart REMOVAL / CLEAR interceptor (checked before the add patterns) ─
        _removal_base = {
            "intents": ["CART_ACTION"],
            "allergies": {}, "preferences": {},
            "search_recipient": None, "location": None, "deadline": None,
            "search_query": None, "budget_limit": None, "tracking_code": None,
            "cart_items": [], "trigger_checkout": False,
            "recipient_name": None, "delivery_address": None,
            "contact_number": None, "gift_message": None,
        }

        CLEAR_PATTERNS = [
            r"\b(?:clear|empty|reset|wipe)\b.*\bcart\b",
            r"\bcart\b.*\b(?:clear|empty|reset|wipe)\b",          # "cart eka clear karanna"
            r"\b(?:remove|delete|take\s+out)\s+(?:all|everything)\b",
            r"\b(?:remove|delete)\s+all\s+(?:the\s+)?items?\b",
        ]
        for pattern in CLEAR_PATTERNS:
            if _re.search(pattern, msg):
                print(f"[CartInterceptor] Forced CART CLEAR — matched pattern: '{pattern}'")
                return {**_removal_base, "clear_cart": True, "cart_remove_items": None}

        remove_match = _re.search(
            r"\b(?:remove|delete|take\s+out|take)\s+(?:the\s+)?(.+?)\s+"
            r"(?:out\s+)?(?:from|off|out\s+of)\s+(?:the\s+|my\s+)?cart\b",
            msg,
        )
        if remove_match:
            remove_query = remove_match.group(1).strip()
            print(f"[CartInterceptor] Forced CART REMOVE — item query: '{remove_query}'")
            return {
                **_removal_base,
                "clear_cart": False,
                "cart_remove_items": [{"query": remove_query, "quantity": 1}],
            }

        # Canonical cart-action trigger phrases — order matters (most specific first)
        CART_PATTERNS = [
            # Explicit "add X to [the/my] cart" — covers "to the cart", "to my cart", "to cart"
            r"\badd\b.*\bto\s+(the\s+|my\s+)?cart\b",
            # "put X in/into [the/my] cart" — `in(?:to)?` matches "in" OR "into"
            r"\bput\b.*\bin(?:to)?\s+(the\s+|my\s+)?cart\b",
            r"\bplace\b.*\bin(?:to)?\s+(the\s+|my\s+)?cart\b",
            # "add the first / add that / add it / add this / add [name]"
            r"\badd\s+(it|that|this|the\s+(first|second|third|top|last))\b",
            # "add item / add an item / add this item" — standalone action without explicit cart reference
            r"\badd\s+(?:an?\s+)?item\b",
            r"\badd\s+this\s+item\b",
            # "buy this / buy it / buy that"
            r"\bbuy\s+(it|this|that|the\s+(first|second|third|top|last))\b",
            # "I'll take it / I want this one / get me that"
            r"\bi'?ll?\s+take\s+(it|this|that)\b",
            r"\bi\s+want\s+this\s+(one|item|product)\b",
            r"\bget\s+me\s+(it|this|that)\b",
            # "checkout / order now / place order"
            r"\bcheckout\b",
            r"\bcheck\s+out\b",
            r"\bplace\s+(the\s+)?order\b",
            r"\border\s+now\b",
            r"\bbuy\s+now\b",
            # "proceed to buy / proceed to checkout / let's checkout"
            r"\bproceed\s+to\s+(?:buy|order|checkout|pay)\b",
            r"\b(?:let'?s?|lets?)\s+(?:proceed|go\s+ahead|checkout)\b",
            r"\bgo\s+ahead\s+(?:and\s+)?(?:order|buy|checkout)\b",
            # Sinhala/Tanglish: "cart ekete danna", "cart eke daala", "cart ekata dapan"
            r"\bcart\s+ek\w*\s+da\w*\b",
        ]

        for pattern in CART_PATTERNS:
            if _re.search(pattern, msg):
                print(f"[CartInterceptor] Forced CART_ACTION — matched pattern: '{pattern}'")
                # Extract a product query from the message for the cart search.
                # Try to pull a quoted product name or a noun phrase after "add"/"buy".
                cart_query = self._extract_cart_query(user_message)
                return {
                    "intents": ["CART_ACTION"],
                    "allergies": {},
                    "preferences": {},
                    "search_recipient": None,
                    "location": None,
                    "deadline": None,
                    "search_query": None,
                    "budget_limit": None,
                    "tracking_code": None,
                    "cart_items": [{"query": cart_query, "quantity": 1}] if cart_query else [],
                    "trigger_checkout": bool(_re.search(r"\b(checkout|order\s+now|buy\s+now|place\s+(the\s+)?order)\b", msg)),
                    "recipient_name": None,
                    "delivery_address": None,
                    "contact_number": None,
                }
        return None  # no intercept — let LLM classify

    def _extract_cart_query(self, user_message: str) -> str:
        """
        Best-effort extraction of the product name from a cart-action message.

        Priority order:
        1. Quoted product name: 'add "Glitter Hearts Chocolate Box" to cart'
        2. Noun phrase between add/buy verb and the cart/now/please terminus,
           with "you showed me", "I saw", "the first/second" stripped out.
        3. History fallback: scan st_memory for the last search_query blob.
        """
        import re as _re

        # 1. Quoted product name
        quoted = _re.search(r'["\']([^"\']{3,})["\']', user_message)
        if quoted:
            return quoted.group(1).strip()

        # 1.5. Sinhala/Tanglish leading phrase: "s11 mini eke cart ekete danna"
        # → the product is everything BEFORE the "cart ek… da…" tail.
        sinhala_match = _re.search(
            r"^(.*?)\s+(?:ek\w*\s+)?cart\s+ek\w*", user_message, _re.IGNORECASE
        )
        if sinhala_match:
            candidate = sinhala_match.group(1).strip()
            # Strip trailing Sinhala particles that bled into the capture.
            candidate = _re.sub(
                r"\b(?:eke|eka|ekak|ekata|ekete|mata|mage|oyata)\s*$", "",
                candidate, flags=_re.IGNORECASE,
            ).strip()
            if len(candidate) > 2:
                return candidate

        # 2. Phrase extraction — capture between action verb and terminus
        phrase_match = _re.search(
            r'\b(?:add|buy|put|get\s+me)\s+(?:the\s+)?(?:first\s+)?(.+?)'
            r'(?:\s+(?:to\s+(?:the\s+|my\s+)?cart|you\s+showed\s+me|i\s+saw|now|please))',
            user_message, _re.IGNORECASE
        )
        if not phrase_match:
            # Fallback: grab everything after "add/buy" and before common suffixes
            phrase_match = _re.search(
                r'\b(?:add|buy)\s+(?:the\s+)?(?:first\s+)?(.+?)(?:\s+to\b|$)',
                user_message, _re.IGNORECASE
            )

        if phrase_match:
            candidate = phrase_match.group(1).strip()
            # Clean noise phrases that leaked in
            for noise in ("you showed me", "i saw earlier", "that you showed",
                          "from before", "the first one", "the one"):
                candidate = _re.sub(_re.escape(noise), "", candidate, flags=_re.IGNORECASE).strip()
            # Reject bare pronouns / position words
            PRONOUNS = {"it", "this", "that", "the first", "the second",
                        "the third", "the top", "the last", "one", ""}
            if candidate.lower() not in PRONOUNS and len(candidate) > 2:
                return candidate

        # 3. History fallback — use the last search_query from prior classifications
        history = self.st_memory.get_history()
        for msg in reversed(history):
            content = msg.get("content", "")
            try:
                start_idx = content.find("{")
                end_idx = content.rfind("}") + 1
                if start_idx != -1 and end_idx > start_idx:
                    blob = json.loads(content[start_idx:end_idx])
                    sq = blob.get("search_query")
                    if sq and isinstance(sq, str):
                        return sq
            except (json.JSONDecodeError, Exception):
                pass

        return ""

    # ── Carousel-aware cart reference resolution ──────────────────────────────

    _ORDINALS = {
        "first": 0, "1st": 0, "top": 0,
        "second": 1, "2nd": 1,
        "third": 2, "3rd": 2,
        "fourth": 3, "4th": 3,
        "fifth": 4, "5th": 4,
    }

    # Filler that carries no product signal — verbs, pronouns, chit-chat,
    # plus Sinhala/Tanglish particles ("… eke cart ekete danna").
    _CART_STOPWORDS = {
        "add", "buy", "put", "place", "get", "take", "me", "to", "the", "my",
        "a", "an", "cart", "in", "into", "it", "that", "this", "one", "item",
        "items", "please", "pls", "can", "could", "u", "you", "i", "think",
        "she", "he", "they", "we", "will", "would", "like", "likes", "love",
        "loves", "want", "wants", "and", "then", "now", "also", "shown",
        "showed", "saw", "earlier", "before", "checkout", "order", "for",
        "her", "him", "them", "of", "on", "so",
        "eke", "eka", "ekak", "ekata", "ekete", "ekath", "danna", "daanna",
        "dapan", "dala", "daala", "oni", "ona", "mata", "mage", "oyata",
        "karala", "karanna", "genna",
    }

    # Modifier words too generic to identify a product on their own — a search
    # result must share at least one token OUTSIDE this set with the query
    # ("s11 mini" must match on "s11", never on "mini" alone → no Mini Cake).
    _GENERIC_MODIFIERS = {
        "mini", "small", "large", "big", "new", "pro", "plus", "max", "set",
        "pack", "box", "combo", "item", "gift", "piece", "style",
    }

    def _pick_verified_search_result(self, query: str, products: list) -> dict | None:
        """From MCP keyword-search results, return the first product whose name
        shares a DISTINCTIVE token with the query — or None (no blind adds)."""
        import re as _re

        def tokens(s: str) -> set[str]:
            out = set()
            for t in _re.findall(r"[a-z0-9]+", (s or "").lower()):
                if len(t) < 2:
                    continue
                out.add(t[:-1] if len(t) > 3 and t.endswith("s") else t)
            return out

        q_tokens = tokens(query) - self._CART_STOPWORDS
        distinctive = q_tokens - self._GENERIC_MODIFIERS
        required = distinctive or q_tokens
        if not required:
            return None
        for p in products:
            if not isinstance(p, dict):
                continue
            if required & tokens(str(p.get("name") or "")):
                return p
        return None

    def _match_last_product(self, query: str, user_message: str) -> dict | None:
        """Resolve a cart reference against the last carousel shown to the user.

        Handles three reference styles, in priority order:
        1. Ordinals — "add the first one", "buy the 2nd".
        2. Partial names — "add the 50 red roses heart shaped bouquet" matches
           "50 Red Roses Heart-shaped Bouquet – Romantic Luxury Flower…" by
           token overlap, so users never need to type the exact catalog title.
        3. Bare pronouns — "add it to my cart" right after a carousel refers to
           the first (top) recommendation.

        Returns the matched product dict, or None when nothing shown/matched
        (caller then falls back to a live MCP search).
        """
        import re as _re

        candidates = [p for p in (self.last_products or []) if isinstance(p, dict)]
        if not candidates:
            return None

        msg = (user_message or "").lower()

        # 1. Ordinal reference
        for word, idx in self._ORDINALS.items():
            if _re.search(rf"\b{word}\b", msg) and idx < len(candidates):
                print(f"[CartResolver] Ordinal '{word}' -> '{candidates[idx].get('name')}'")
                return candidates[idx]
        if _re.search(r"\blast\s+(one|item|product)\b", msg):
            return candidates[-1]

        def tokens(s: str) -> set[str]:
            out = set()
            for t in _re.findall(r"[a-z0-9]+", (s or "").lower()):
                if t in self._CART_STOPWORDS or len(t) < 2:
                    continue
                # Cheap plural fold so "roses" matches "Rose" and vice versa.
                out.add(t[:-1] if len(t) > 3 and t.endswith("s") else t)
            return out

        # Score against BOTH the extracted query and the raw message. The
        # extracted query can be a stale history fallback (e.g. "flowers"),
        # while the literal message often carries the richest product tokens
        # ("...the 50 red roses heart shaped bouquet...") — best match wins.
        token_sets = [ts for ts in (tokens(query), tokens(user_message)) if ts]

        # 3. Bare pronoun ("add it/that") — nothing product-like left in the
        # message; "it" means the recommendation they're looking at.
        if not token_sets:
            print(f"[CartResolver] Pronoun reference -> first shown item '{candidates[0].get('name')}'")
            return candidates[0]

        # 2. Token-overlap name match
        best: dict | None = None
        best_key = (0, 0.0, 0)
        for q_tokens in token_sets:
            for pos, p in enumerate(candidates):
                name_tokens = tokens(str(p.get("name") or ""))
                overlap = len(q_tokens & name_tokens)
                if overlap == 0:
                    continue
                coverage = overlap / len(q_tokens)
                # Accept only confident matches: 2+ shared tokens, or every token
                # the user gave appears in the product name ("add roses" → Roses).
                if overlap < 2 and coverage < 1.0:
                    continue
                key = (overlap, coverage, -pos)  # more overlap > more coverage > shown earlier
                if key > best_key:
                    best, best_key = p, key

        if best is not None:
            print(
                f"[CartResolver] Matched '{query or user_message}' -> "
                f"'{best.get('name')}' (overlap={best_key[0]}, coverage={best_key[1]:.2f})"
            )
        return best

    # ── Conversational side-by-side comparison ────────────────────────────────

    _COMPARE_TRIGGER = (
        r"\b(?:compare|comparison|vs\.?|versus|difference\s+between|"
        r"which\s+(?:one\s+)?is\s+better|better\s+option)\b"
    )

    def _detect_compare(self, user_message: str) -> list[dict] | None:
        """Resolve a comparison request against the on-screen carousel.

        Returns 2-3 product dicts to compare, or None when this isn't a
        comparison turn / fewer than two items can be resolved (the turn then
        flows through the normal classifier — empty-state safe).
        """
        import re as _re

        msg = (user_message or "").lower()
        if not _re.search(self._COMPARE_TRIGGER, msg):
            return None
        candidates = [p for p in (self.last_products or []) if isinstance(p, dict)]
        if len(candidates) < 2:
            return None

        picks: list[dict] = []

        # 1. "compare the first two / top 3 / last two"
        m = _re.search(r"\b(first|top|last)\s+(two|three|2|3)\b", msg)
        if m:
            n = 3 if m.group(2) in ("three", "3") else 2
            picks = candidates[-n:] if m.group(1) == "last" else candidates[:n]
        else:
            # 2. Individual ordinals: "compare the first and the third"
            idxs = sorted({
                i for w, i in self._ORDINALS.items()
                if _re.search(rf"\b{w}\b", msg) and i < len(candidates)
            })
            if len(idxs) >= 2:
                picks = [candidates[i] for i in idxs[:3]]

        if not picks:
            # 3. Name fragments: "compare the s11 mini with the redmi watch"
            IGNORE = self._CART_STOPWORDS | {
                "compare", "comparison", "versus", "vs", "between", "difference",
                "which", "better", "best", "option", "two", "three",
            }

            def frag_tokens(s: str) -> set[str]:
                return {
                    t[:-1] if len(t) > 3 and t.endswith("s") else t
                    for t in _re.findall(r"[a-z0-9]+", s)
                    if len(t) > 1 and t not in IGNORE
                }

            matched: list[dict] = []
            for frag in _re.split(r"\bvs\.?\b|\bversus\b|\band\b|\bwith\b|,", msg):
                ft = frag_tokens(frag)
                if not ft:
                    continue
                best, best_key = None, (0, 0.0)
                for pos, p in enumerate(candidates):
                    nt = frag_tokens(str(p.get("name") or "").lower())
                    overlap = len(ft & nt)
                    if overlap == 0:
                        continue
                    coverage = overlap / len(ft)
                    if overlap >= 2 or coverage >= 1.0:
                        key = (overlap, coverage)
                        if key > best_key:
                            best, best_key = p, key
                if best is not None and best not in matched:
                    matched.append(best)
            picks = matched[:3]

        # 4. Bare "compare them / these" → the top two on screen
        if len(picks) < 2 and _re.search(r"\b(?:them|these|those|all)\b", msg):
            picks = candidates[:2]

        return picks if len(picks) >= 2 else None

    async def _run_comparison(self, products: list[dict], user_message: str):
        """Stream a high-contrast comparison grid + a brief AI verdict."""
        import asyncio
        from agents.catalog_agent import parse_product_price, _reply_language_directive

        classification = {
            "intents": ["COMPARE"], "allergies": {}, "preferences": {},
            "search_recipient": None, "location": None, "deadline": None,
            "search_query": None, "budget_limit": None, "tracking_code": None,
            "cart_items": None, "trigger_checkout": False,
        }
        yield f"<<CLASSIFICATION>>:{json.dumps(classification)}"
        # Re-surface the compared items as a carousel under the grid.
        yield f"<<PRODUCTS>>:{json.dumps(products)}"

        def cell(v: object) -> str:
            return str(v if v is not None else "—").replace("|", "/").replace("\n", " ").strip()

        names, prices, avail, cats = [], [], [], []
        for p in products:
            names.append(cell(p.get("name", "Item"))[:48])
            price_val = parse_product_price(p.get("price"))
            prices.append(f"Rs. {price_val:,.0f}" if price_val else cell(p.get("price")))
            avail.append(cell(p.get("availability") or p.get("stock") or "Unknown"))
            cats.append(cell(p.get("category") or "—"))

        table = "\n".join([
            "| | " + " | ".join(names) + " |",
            "|---" * (len(products) + 1) + "|",
            "| Price | " + " | ".join(prices) + " |",
            "| Availability | " + " | ".join(avail) + " |",
            "| Category | " + " | ".join(cats) + " |",
        ])
        grid_text = "Here's the side-by-side 👇\n\n" + table + "\n\n"
        yield grid_text

        # Brief structural AI recommendation (deterministic fallback on failure).
        recommendation = ""
        try:
            from infrastructure.llm.client import is_mock_mode
            if not is_mock_mode():
                rec_system = (
                    "You are Ruki, Kapruka's sharp shopping concierge. Given the compared "
                    "products (JSON) and the user's request, give ONE brief recommendation: "
                    "which to pick and why, in at most 2 sentences. No markdown, no lists. "
                    + _reply_language_directive(user_message)
                )
                recommendation = (await asyncio.to_thread(
                    chat,
                    rec_system,
                    [{"role": "user", "content": f"Products: {json.dumps(products)}\nUser asked: {user_message}"}],
                    180,
                    CLAUDE_MODEL_CLASSIFY,
                    False,
                    0.6,
                )).strip()
        except Exception as e:
            print(f"[Compare] Recommendation LLM failed, using deterministic pick: {e}")

        if not recommendation:
            in_stock = [p for p in products if "out" not in str(p.get("availability") or "").lower()]
            pool = in_stock or products
            cheapest = min(pool, key=lambda p: parse_product_price(p.get("price")) or float("inf"))
            c_price = parse_product_price(cheapest.get("price"))
            recommendation = (
                f"My quick take: {cell(cheapest.get('name'))} is the strongest value here"
                + (f" at Rs. {c_price:,.0f}" if c_price else "")
                + " and it's ready to ship."
            )
        yield recommendation

        self.st_memory.add_message("user", user_message + " " + json.dumps(classification))
        self.st_memory.add_message("assistant", grid_text + recommendation)

    # ── Conversational gift-card message composer ─────────────────────────────

    _GIFT_MSG_TRIGGER = (
        r"\b(?:write|compose|create|draft|generate|make(?:\s+up)?|liyanna|liyala)\b"
        r".{0,40}\b(?:gift\s*card|card|greeting|message|note|wish(?:es)?)\b"
        r"|\bgift\s+message\s+ekak\b"
        r"|\badd\s+a\s+(?:card|note)\s+saying\b"
    )

    def _detect_gift_message_request(self, user_message: str) -> bool:
        import re as _re
        return bool(_re.search(self._GIFT_MSG_TRIGGER, (user_message or "").lower()))

    async def _run_gift_message(self, user_message: str):
        """Compose a localized gift-card message and attach it to the cart state."""
        import asyncio
        import re as _re
        from agents.catalog_agent import _reply_language_directive

        classification = {
            "intents": ["GIFT_MESSAGE"], "allergies": {}, "preferences": {},
            "search_recipient": None, "location": None, "deadline": None,
            "search_query": None, "budget_limit": None, "tracking_code": None,
            "cart_items": None, "trigger_checkout": False,
        }
        yield f"<<CLASSIFICATION>>:{json.dumps(classification)}"

        # Verbatim text in quotes wins outright ("add a card saying 'Happy Bday Amma'").
        quoted = _re.search(r"[\"“'‘]([^\"”'’]{3,200})[\"”'’]", user_message)
        message: str = ""
        if quoted:
            message = quoted.group(1).strip()
        else:
            try:
                from infrastructure.llm.client import is_mock_mode
                if not is_mock_mode():
                    compose_system = (
                        "You are Ruki, Kapruka's concierge, writing a gift-card message. "
                        "Honour any tone, relationship, occasion or language the user asked for. "
                        "2-4 short heartfelt sentences. Output ONLY the card message text — "
                        "no quotes, no preamble, no signature placeholders. "
                        + _reply_language_directive(user_message)
                    )
                    message = (await asyncio.to_thread(
                        chat,
                        compose_system,
                        [{"role": "user", "content": user_message}],
                        220,
                        CLAUDE_MODEL_CLASSIFY,
                        False,
                        0.8,
                    )).strip().strip('"“”')
            except Exception as e:
                print(f"[GiftMessage] Compose LLM failed, using template: {e}")
        if not message:
            message = (
                "Wishing you every bit of joy this special day deserves — "
                "may it be filled with laughter, love, and a little Kapruka magic. 🎁"
            )

        # Payload state: ride the cart_update channel so the frontend keeps the
        # message alongside the cart without any external form.
        self.pending_gift_message = message
        yield f"<<CART_UPDATE>>:{json.dumps({'products': [], 'trigger_checkout': False, 'gift_message': message})}"

        reply = (
            f"Here's your card message ✍️\n\n“{message}”\n\n"
            "I've attached it to your cart details — paste it into the gift-note box at "
            "Kapruka checkout, or ask me to rewrite it in a different tone or language."
        )
        yield reply
        self.st_memory.add_message("user", user_message + " " + json.dumps(classification))
        self.st_memory.add_message("assistant", reply)

    # ── Dynamic parcel-tracking interceptor ───────────────────────────────────

    def _detect_tracking(self, user_message: str) -> dict | None:
        """Intercept tracking-reference turns ("track order 218760") without an
        LLM round-trip. The captured code must contain at least one digit so
        phrases like "track my last order" fall through to the classifier."""
        import re as _re

        msg = user_message or ""
        m = _re.search(
            r"\btrack(?:ing)?\b\s*(?:my\s+)?(?:order|parcel|package|delivery)?\s*"
            r"(?:number|no\.?|#)?\s*((?=[A-Za-z0-9-]*\d)[A-Za-z0-9-]{4,})",
            msg, _re.IGNORECASE,
        )
        if not m:
            m = _re.search(
                r"\bwhere(?:'s|\s+is)\s+my\s+(?:order|parcel|package)\s*#?\s*"
                r"((?=[A-Za-z0-9-]*\d)[A-Za-z0-9-]{4,})",
                msg, _re.IGNORECASE,
            )
        if not m:
            return None
        code = m.group(1)
        print(f"[TrackingInterceptor] Forced LOGISTICS — tracking code: '{code}'")
        return {
            "intents": ["LOGISTICS"],
            "allergies": {}, "preferences": {},
            "search_recipient": None, "location": None, "deadline": None,
            "search_query": None, "budget_limit": None,
            "tracking_code": code,
            "cart_items": None, "cart_remove_items": None, "clear_cart": False,
            "trigger_checkout": False, "recipient_name": None,
            "delivery_address": None, "contact_number": None, "gift_message": None,
        }

    def classify_intents(self, user_message: str) -> dict:

        # ── Pre-LLM tracking interceptor ──────────────────────────────────────
        # "track order 218760" needs zero classification — go straight to the
        # logistics agent with the extracted reference.
        tracked = self._detect_tracking(user_message)
        if tracked is not None:
            return tracked

        # ── Pre-LLM cart-action interceptor ───────────────────────────────────
        # Catches unambiguous action phrases ("add to cart", "buy it", "checkout")
        # and returns a forced CART_ACTION classification without an LLM call.
        # The _enrich_from_history step in route_stream will backfill allergies,
        # location and budget from prior turns afterwards.
        intercepted = self._detect_cart_action(user_message)
        if intercepted is not None:
            return intercepted

        history = self.st_memory.get_history()
        messages = history + [{"role": "user", "content": user_message}]

        try:
            raw = chat(
                system=ROUTER_SYSTEM_PROMPT,
                messages=messages,
                max_tokens=CLAUDE_MAX_TOKENS_CLASSIFY,
                model=CLAUDE_MODEL_CLASSIFY,
                json_mode=True,
                temperature=0.1,  # deterministic JSON classification
            )
        except LLMUnavailableError as e:
            # Real Gemini call failed (not offline mock mode). Fall back to a safe
            # SEARCH default using the raw message — never invent a category.
            print(f"[Router] LLM classify unavailable, using safe default: {e}")
            return self._guard_search_query({
                "intents": ["SEARCH"],
                "allergies": {},
                "preferences": {},
                "search_recipient": None,
                "location": None,
                "deadline": None,
                "search_query": "gift",
                "budget_limit": None,
                "tracking_code": None,
                "cart_items": None,
                "trigger_checkout": False,
                "recipient_name": None,
                "delivery_address": None,
                "contact_number": None,
            }, user_message)

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
            return self._guard_search_query(result, user_message)

        except (json.JSONDecodeError, ValueError): #value errors for pydantic errors
            return self._guard_search_query({
                "intents": ["SEARCH"],
                "allergies": {},
                "preferences": {},
                "search_recipient": None,
                "location": None,
                "deadline": None,
                "search_query": "gift",
                "budget_limit": None,
                "tracking_code": None,
                "cart_items": None,
                "trigger_checkout": False,
                "recipient_name": None,
                "delivery_address": None,
                "contact_number": None
            }, user_message)

    # ── Deterministic search_query guard ──────────────────────────────────────
    # Generic gift words that mean "a gift" — NOT a concrete product category.
    _GENERIC_GIFT_WORDS = {
        "gift", "gifts", "hadiyak", "hadiya", "thohfa", "thohfe", "present",
        "presents", "surprise", "ekak", "something", "thelak",
    }

    def _guard_search_query(self, classification: dict, user_message: str) -> dict:
        """Stop the LLM from hallucinating a concrete category the user never said.

        If the raw user message used a generic gift word (e.g. "gift ekak oni",
        "hadiyak") but did NOT literally name the category the LLM returned
        (e.g. message has no "chocolate" yet search_query == "chocolate"), force
        search_query back to "gift". Deterministic — does not rely on the LLM
        obeying the prompt. Directly kills the Father's-Day → "chocolate" bug.
        """
        import re as _re

        sq = (classification.get("search_query") or "").strip().lower()
        if not sq or sq == "gift":
            return classification

        msg = (user_message or "").lower()
        msg_tokens = set(_re.findall(r"[a-z']+", msg))

        # Did the user use a generic gift word?
        used_generic = bool(msg_tokens & self._GENERIC_GIFT_WORDS)
        # Did the user literally mention the category the LLM returned?
        # Compare on the first significant word of the query (e.g. "chocolate box" -> "chocolate").
        sq_head = sq.split()[0] if sq.split() else sq
        category_in_message = sq_head in msg or sq in msg

        if used_generic and not category_in_message:
            print(
                f"[Guard] LLM invented search_query='{classification.get('search_query')}' "
                f"from a generic gift request — overriding to 'gift'."
            )
            classification["search_query"] = "gift"
        return classification

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

    def _classification_from_profile(self, profile: dict, user_message: str) -> dict:
        """Build a SEARCH classification directly from a saved GiftProfile row.

        Used to SHORT-CIRCUIT the LLM intent classifier: the profile's recipient,
        occasion and allergens are authoritative, so we load them straight into
        the operational classification frame instead of guessing from text.
        """
        recipient = (profile.get("recipient_name") or "recipient").strip()
        allergies = [str(a).strip() for a in (profile.get("allergies") or []) if str(a).strip()]

        # If the user named a concrete product, honour it; otherwise default to a
        # generic gift search (occasion fallbacks pick suitable items).
        sq = self._guard_search_query({"search_query": user_message}, user_message).get("search_query")
        if not sq or len(sq.split()) > 2:
            sq = "gift"

        return {
            "intents": ["SEARCH"],
            "allergies": {recipient.lower(): allergies} if allergies else {},
            "preferences": {},
            "search_recipient": recipient,
            "location": None,
            "deadline": profile.get("occasion"),
            "search_query": sq,
            "budget_limit": None,
            "tracking_code": None,
            "cart_items": None,
            "trigger_checkout": False,
            "recipient_name": None,
            "delivery_address": None,
            "contact_number": None,
            "gift_message": None,
        }

    async def route_stream(self, user_message: str, recipient_context: dict | None = None, budget_limit: float | None = None, vibe_check: str | None = None, gift_profile: dict | None = None):
        """Streaming version of route() — yields chunks for SEARCH responses."""
        import asyncio

        # ── COMPARISON SHORT-CIRCUIT ─────────────────────────────────────────
        # "compare the first two" / "s11 vs redmi" against the on-screen
        # carousel: fully deterministic resolution, zero classifier round-trip.
        compare_products = self._detect_compare(user_message)
        if compare_products:
            print(f"[Router] Comparison turn — {len(compare_products)} items resolved from carousel.")
            async for chunk in self._run_comparison(compare_products, user_message):
                yield chunk
            return

        # ── GIFT-MESSAGE SHORT-CIRCUIT ───────────────────────────────────────
        # "write a sweet card for my amma in Sinhala" → compose + attach to the
        # cart payload state conversationally, no external form.
        if self._detect_gift_message_request(user_message):
            print("[Router] Gift-message composition turn.")
            async for chunk in self._run_gift_message(user_message):
                yield chunk
            return

        # ── PROFILE SHORT-CIRCUIT ─────────────────────────────────────────────
        # When the turn references a saved Occasion Vibe Calendar profile, bypass
        # the conversational intent classifier entirely and load the profile's
        # parameters directly. Otherwise classify as usual.
        start = time.time()
        if gift_profile:
            print(f"[Router] Short-circuit from gift profile '{gift_profile.get('recipient_name')}'.")
            classification = self._classification_from_profile(gift_profile, user_message)
        else:
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

        # Write the effective budget back into the classification so the intent
        # badge the user sees matches the constraint actually used for search.
        if budget_limit is not None:
            classification["budget_limit"] = budget_limit

        intents = classification.get("intents", ["SEARCH"])

        # ── CART_ACTION + SEARCH handling ────────────────────────────────────
        # When the LLM intentionally returns both (multi-intent: "add X and find Y"),
        # we allow them to coexist so both the cart-add and the product search run.
        # We only strip SEARCH when it looks like an LLM mis-classification (no
        # explicit search request phrasing alongside the cart action).
        import re as _re
        _has_explicit_search = bool(_re.search(
            r'\b(?:and\s+(?:then\s+)?(?:find|show|search|look\s+for)|also\s+(?:find|show|search)|plus\s+(?:find|show))\b',
            user_message, _re.IGNORECASE
        ))
        if "CART_ACTION" in intents and "SEARCH" in intents and not _has_explicit_search:
            intents = [i for i in intents if i != "SEARCH"]
            classification["intents"] = intents
            print("[Router] Stripped SEARCH from CART_ACTION turn (no explicit search request).")

        print(f"Customer        : {self.customer_id}")
        print(f"Router Decision : {intents}")
        print(f"Extracted+Enriched: {json.dumps(classification, indent=2)}")

        # Yield classification token for SSE handler
        yield f"<<CLASSIFICATION>>:{json.dumps(classification)}"

        # Initialize response chunks list early (needed by CART_ACTION block below)
        full_response_chunks = []

        # Handle CART_ACTION
        cart_products_to_add = []
        cart_removal_handled = False
        if "CART_ACTION" in intents:
            # ── Removal / clear operations first ─────────────────────────────
            # The cart itself lives in the frontend, so the backend only names
            # WHAT to remove; the frontend matches it against its own items.
            _clear_cart = bool(classification.get("clear_cart"))
            _remove_items = classification.get("cart_remove_items") or []
            _remove_queries = [
                str(ri.get("query")).strip()
                for ri in _remove_items
                if isinstance(ri, dict) and str(ri.get("query") or "").strip()
            ]
            if _clear_cart or _remove_queries:
                cart_removal_handled = True
                removal_payload = {
                    "clear_cart": _clear_cart,
                    "remove_queries": _remove_queries,
                    "products": [],
                    "trigger_checkout": False,
                }
                yield f"<<CART_UPDATE>>:{json.dumps(removal_payload)}"
                if _clear_cart:
                    confirm_msg = "All done — your cart is empty now! 🛒 Fresh start, what shall we find next?"
                else:
                    confirm_msg = f"Done! I've taken {', '.join(_remove_queries)} out of your cart."
                yield confirm_msg
                full_response_chunks.append(confirm_msg)

            cart_items = classification.get("cart_items") or []
            trigger_checkout = classification.get("trigger_checkout") or False

            # Pronoun-only add ("add it to my cart") arrives with no cart_items
            # query — resolve it against the carousel the user is looking at.
            # Never on a removal turn ("take that out of the cart" must not ADD).
            if not cart_removal_handled and not cart_items and not trigger_checkout and _re.search(
                r"\b(?:add|buy|take|get|put)\b.*\b(?:it|that|this|one)\b",
                user_message, _re.IGNORECASE,
            ):
                cart_items = [{"query": "", "quantity": 1}]

            for item in cart_items:
                q = item.get("query") or ""
                quantity = item.get("quantity", 1)

                # 1. Resolve against the last shown carousel first — a fresh MCP
                # keyword search for a partial name routinely returns a
                # DIFFERENT product than the one on the user's screen.
                matched = self._match_last_product(q, user_message)
                if matched is not None:
                    p_to_add = dict(matched)
                    p_to_add["quantity"] = quantity
                    cart_products_to_add.append(p_to_add)
                    continue

                # 2. Nothing shown / no overlap — fall back to a live search,
                # but VERIFY the hit shares a distinctive token with the query.
                # Kapruka's keyword relevance is loose ("s11 mini" → "Mini
                # Cake"); adding its blind top hit put wrong items in carts.
                if q:
                    try:
                        from infrastructure.mcp.client import kapruka_search_products
                        search_res = await kapruka_search_products(q, limit=5)
                        products = []
                        if isinstance(search_res, dict):
                            products = search_res.get("products") or search_res.get("result") or []
                        elif isinstance(search_res, list):
                            products = search_res

                        verified = self._pick_verified_search_result(q, products)
                        if verified is not None:
                            p_to_add = dict(verified)
                            p_to_add["quantity"] = quantity
                            cart_products_to_add.append(p_to_add)
                        elif products:
                            print(
                                f"[CartResolver] Rejected top search hit "
                                f"'{products[0].get('name')}' for query '{q}' — no distinctive token overlap."
                            )
                    except Exception as e:
                        print(f"Error searching product '{q}' for cart: {e}")

            # If products were matched or checkout is triggered, yield <<CART_UPDATE>>:
            if cart_products_to_add or trigger_checkout:
                cart_update_payload = {
                    "products": cart_products_to_add,
                    "trigger_checkout": trigger_checkout,
                    "recipient_name": classification.get("recipient_name"),
                    "delivery_address": classification.get("delivery_address"),
                    "contact_number": classification.get("contact_number"),
                    # A conversationally-composed card message stays attached to
                    # the cart payload state until the user replaces it.
                    "gift_message": classification.get("gift_message") or self.pending_gift_message,
                }
                yield f"<<CART_UPDATE>>:{json.dumps(cart_update_payload)}"

            # Confirm to the user
            if cart_products_to_add:
                names = ", ".join([p.get("name", "Item") for p in cart_products_to_add])
                confirm_msg = f"Done! I've added {names} to your cart. "
                if trigger_checkout:
                    confirm_msg += "Generating your checkout link now..."
                else:
                    confirm_msg += "Want a gift-card message to go with it? Just ask me to write one ✍️"
                yield confirm_msg
                full_response_chunks.append(confirm_msg)
            elif trigger_checkout:
                confirm_msg = "Perfect! Generating your checkout link now. Please review the details in the popup..."
                yield confirm_msg
                full_response_chunks.append(confirm_msg)
            elif "SEARCH" not in intents and not cart_removal_handled:
                # A cart command we couldn't resolve — say so instead of ending
                # the stream silently (which surfaced as the frontend's generic
                # "couldn't find matching results" fallback).
                fail_msg = (
                    "Hmm, I couldn't match that to one of the items I showed you 🛒 — "
                    "tell me a bit of the product name (or just say \"add the first one\") "
                    "and I'll pop it in your cart!"
                )
                yield fail_msg
                full_response_chunks.append(fail_msg)

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
            # Resolve occasion: prefer router-extracted deadline (e.g. "Father's Day"),
            # fall back to sidebar dropdown value nested under any recipient key.
            _occasion = classification.get("deadline") or next(
                (v.get("occasion") for v in (recipient_context or {}).values()
                 if isinstance(v, dict) and v.get("occasion")),
                None
            )
            # Authoritative allergen set for the definitive hard-stop purge in the
            # catalog agent: the saved DB profile's allergens PLUS every allergen
            # resolved for this turn (current + history-enriched). Union so the
            # final gate is absolute, not scoped to a single recipient.
            _allergen_union = set()
            if gift_profile:
                _allergen_union.update(
                    str(a).lower().strip() for a in (gift_profile.get("allergies") or []) if str(a).strip()
                )
            for _lst in (classification.get("allergies") or {}).values():
                _allergen_union.update(
                    str(a).lower().strip() for a in (_lst or []) if str(a).strip()
                )
            _profile_allergies = sorted(_allergen_union) or None
            async for chunk in catalog_agent.run_stream(
                recipients=all_recipients,
                search_query=classification.get("search_query") or user_message,
                old_profile=old_profile,
                new_profile=new_profile,
                query_vector=query_vector,
                budget_limit=budget_limit,
                occasion=_occasion,
                user_raw_message=user_message,
                vibe_check=vibe_check,
                profile_allergies=_profile_allergies,
            ):
                # Remember what's on the user's screen so follow-up cart
                # commands ("add that one") resolve against this carousel.
                if isinstance(chunk, str) and chunk.startswith("<<PRODUCTS>>:"):
                    try:
                        shown = json.loads(chunk.split("<<PRODUCTS>>:", 1)[1])
                        if isinstance(shown, list) and shown:
                            self.last_products = shown
                    except (json.JSONDecodeError, ValueError):
                        pass
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