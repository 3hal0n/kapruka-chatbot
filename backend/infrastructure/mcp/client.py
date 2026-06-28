"""
infrastructure/mcp/client.py
Asynchronous Model Context Protocol (MCP) Client for Kapruka.
"""

import json
import time
import asyncio
import logging
import httpx
from typing import Dict, Any, Optional, List
from contextlib import AsyncExitStack, asynccontextmanager

from mcp import ClientSession
from mcp.shared.message import SessionMessage
import mcp.types as types

logger = logging.getLogger("kapruka-mcp-client")


class RateLimitedAsyncClient(httpx.AsyncClient):
    """
    Custom HTTP Client that intercepts headers of all network traffic (SSE transport write requests)
    to dynamically track rate limit attributes.
    """
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.rate_limit_limit = 60
        self.rate_limit_remaining = 60
        self.rate_limit_reset = 0.0
        self.last_response_time = time.time()

    async def send(self, request, *args, **kwargs):
        response = await super().send(request, *args, **kwargs)
        
        # Check standard RateLimit and X-RateLimit headers
        limit = response.headers.get("RateLimit-Limit") or response.headers.get("X-RateLimit-Limit")
        remaining = response.headers.get("RateLimit-Remaining") or response.headers.get("X-RateLimit-Remaining")
        reset = response.headers.get("RateLimit-Reset") or response.headers.get("X-RateLimit-Reset")
        
        if limit is not None:
            try:
                self.rate_limit_limit = int(limit)
            except ValueError:
                pass
        if remaining is not None:
            try:
                self.rate_limit_remaining = int(remaining)
            except ValueError:
                pass
        if reset is not None:
            try:
                self.rate_limit_reset = float(reset)
            except ValueError:
                pass
        
        self.last_response_time = time.time()
        logger.debug(
            f"Rate limits updated -> Limit: {self.rate_limit_limit}, "
            f"Remaining: {self.rate_limit_remaining}, Reset: {self.rate_limit_reset}s"
        )
        return response


import anyio
from anyio.streams.memory import MemoryObjectReceiveStream, MemoryObjectSendStream
from typing import AsyncGenerator, Tuple

@asynccontextmanager
async def custom_sse_client(
    url: str,
    session_id: str,
    http_client: RateLimitedAsyncClient
) -> AsyncGenerator[Tuple[MemoryObjectReceiveStream[SessionMessage | Exception], MemoryObjectSendStream[SessionMessage]], None]:
    """
    Custom SSE Transport client designed for the Kapruka MCP server.
    Bypasses waiting for standard 'endpoint' event and handles JSON-RPC messages 
    delivered in both SSE stream events and POST response payloads.
    """
    read_stream_writer, read_stream = anyio.create_memory_object_stream(0)
    write_stream, write_stream_reader = anyio.create_memory_object_stream(0)

    async def process_sse_data(sse_data: str):
        try:
            message = types.JSONRPCMessage.model_validate_json(sse_data)
            logger.debug(f"Parsed JSON-RPC message: {message}")
            session_message = SessionMessage(message)
            await read_stream_writer.send(session_message)
        except Exception as e:
            logger.warning(f"Error parsing JSON-RPC message: {e} | data: {sse_data}")

    async def sse_reader():
        logger.info("Starting custom SSE reader stream...")
        try:
            async with http_client.stream("GET", url, timeout=httpx.Timeout(5.0, read=300.0)) as r:
                logger.info(f"SSE stream response status: {r.status_code}")
                current_event = None
                async for line in r.aiter_lines():
                    line = line.strip()
                    if not line:
                        continue
                    logger.debug(f"SSE line: {line}")
                    if line.startswith("event:"):
                        current_event = line[len("event:"):].strip()
                    elif line.startswith("data:"):
                        data_val = line[len("data:"):].strip()
                        if current_event == "message" or not current_event:
                            await process_sse_data(data_val)
                    elif line.startswith(":"):
                        # Keep-alive ping
                        logger.debug(f"Keep-alive ping: {line}")
        except Exception as e:
            logger.error(f"SSE reader exception: {e}")
            if not read_stream_writer.extra_attributes:
                try:
                    await read_stream_writer.send(e)
                except Exception:
                    pass
        finally:
            await read_stream_writer.aclose()

    async def post_writer():
        logger.info("Starting custom POST writer...")
        try:
            async with write_stream_reader:
                async for session_message in write_stream_reader:
                    payload = session_message.message.model_dump(
                        by_alias=True,
                        mode="json",
                        exclude_none=True
                    )
                    logger.debug(f"Sending client message via POST: {payload}")
                    
                    post_headers = {
                        "Content-Type": "application/json",
                        "Accept": "application/json, text/event-stream"
                    }
                    
                    resp = await http_client.post(url, json=payload, headers=post_headers)
                    logger.debug(f"POST response status: {resp.status_code}")
                    
                    body = resp.text.strip()
                    if "data:" in body:
                        # Extract data line(s) from standard event-stream POST response
                        for line in body.split("\n"):
                            line = line.strip()
                            if line.startswith("data:"):
                                data_val = line[len("data:"):].strip()
                                await process_sse_data(data_val)
                    elif body.startswith("{"):
                        # Direct JSON response payload
                        await process_sse_data(body)
        except Exception as e:
            logger.exception("Error in post_writer")
        finally:
            await write_stream.aclose()

    async with anyio.create_task_group() as tg:
        tg.start_soon(sse_reader)
        tg.start_soon(post_writer)
        
        try:
            yield read_stream, write_stream
        finally:
            tg.cancel_scope.cancel()


class KaprukaMCPClient:
    """
    Async Context Manager to establish and maintain an SSE connection session
    with the Kapruka remote MCP server using our custom transport.
    """
    def __init__(self, sse_url: str = "https://mcp.kapruka.com/mcp"):
        self.sse_url = sse_url
        self.http_client: Optional[RateLimitedAsyncClient] = None
        self.mcp_session: Optional[ClientSession] = None
        self._exit_stack: Optional[AsyncExitStack] = None

    async def __aenter__(self):
        self._exit_stack = AsyncExitStack()
        try:
            logger.info(f"Connecting to Kapruka remote MCP server at {self.sse_url}...")
            
            # Step 1: Query server to initialize a session and retrieve the session ID from response headers
            async with httpx.AsyncClient(timeout=15.0) as temp_client:
                logger.info("Performing handshake to retrieve session ID...")
                resp = await temp_client.get(self.sse_url)
                session_id = resp.headers.get("mcp-session-id")
                if not session_id:
                    raise RuntimeError("Server did not return an 'mcp-session-id' header.")
                logger.info(f"Handshake successful. Session ID generated: {session_id}")

            # Step 2: Initialize our custom RateLimitedAsyncClient
            headers = {
                "Accept": "application/json, text/event-stream",
                "mcp-session-id": session_id
            }
            self.http_client = RateLimitedAsyncClient(headers=headers, timeout=30.0)
            await self._exit_stack.enter_async_context(self.http_client)
            
            # Step 3: Connect using custom_sse_client
            read, write = await self._exit_stack.enter_async_context(
                custom_sse_client(
                    url=self.sse_url,
                    session_id=session_id,
                    http_client=self.http_client
                )
            )
            
            # Bind MCP Client Session
            self.mcp_session = await self._exit_stack.enter_async_context(
                ClientSession(read, write)
            )
            
            # Initialize MCP Session
            await self.mcp_session.initialize()
            logger.info("Kapruka MCP connection successfully initialized.")
            return self
            
        except Exception as e:
            logger.error(f"Failed to connect to Kapruka MCP server: {e}")
            await self._exit_stack.aclose()
            raise e

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self._exit_stack:
            await self._exit_stack.aclose()
            logger.info("Kapruka MCP connection closed.")


class KaprukaMCPClientManager:
    """
    Singleton Manager that holds the active client across FastAPI request life cycles.
    """
    def __init__(self, sse_url: str = "https://mcp.kapruka.com/mcp"):
        self.sse_url = sse_url
        self.client: Optional[KaprukaMCPClient] = None

    async def start(self):
        if self.client is None:
            self.client = KaprukaMCPClient(self.sse_url)
            await self.client.__aenter__()

    async def stop(self):
        if self.client is not None:
            await self.client.__aexit__(None, None, None)
            self.client = None


# Global singleton instance
kapruka_mcp = KaprukaMCPClientManager()


async def with_rate_limit_backoff(func, *args, **kwargs):
    """
    Wrapper implementing async exponential backoff to safeguard against rate limits (60 req/min).
    """
    max_attempts = 5
    base_backoff = 1.0
    
    for attempt in range(max_attempts):
        client = kapruka_mcp.client
        if client and client.http_client:
            # Proactively throttle if remaining token pool is empty or low
            if client.http_client.rate_limit_remaining <= 1:
                wait_time = max(client.http_client.rate_limit_reset, 1.0)
                logger.warning(
                    f"Proactive Throttling: Rate limits low (remaining={client.http_client.rate_limit_remaining}). "
                    f"Sleeping for {wait_time:.2f} seconds..."
                )
                await asyncio.sleep(wait_time)
                # Reset remaining counter locally assuming sleep cleared the window
                client.http_client.rate_limit_remaining = 60
                
        try:
            return await func(*args, **kwargs)
        except Exception as e:
            err_str = str(e).lower()
            # Detect standard rate limit issues
            is_rate_limit = any(
                term in err_str for term in ["429", "rate limit", "ratelimit", "too many requests"]
            )
            
            if is_rate_limit and attempt < max_attempts - 1:
                # Retrieve wait time from client headers, else use default backoff exponent
                wait_time = 0.0
                if client and client.http_client:
                    wait_time = client.http_client.rate_limit_reset
                if wait_time <= 0:
                    wait_time = base_backoff * (2 ** attempt)
                    
                logger.warning(
                    f"Rate limit hit. Retrying in {wait_time:.2f} seconds (Attempt {attempt+1}/{max_attempts})...."
                )
                await asyncio.sleep(wait_time)
                if client and client.http_client:
                    client.http_client.rate_limit_remaining = 60
            else:
                logger.error(f"Error calling MCP tool: {e}")
                raise e


async def _execute_mcp_tool(tool_name: str, arguments: dict) -> Any:
    """
    Internal execution wrapper that sends the tool request and parses content results.
    """
    if not kapruka_mcp.client or not kapruka_mcp.client.mcp_session:
        raise RuntimeError("Kapruka MCP client connection has not been initialized.")
        
    session = kapruka_mcp.client.mcp_session
    logger.info(f"Calling MCP tool: {tool_name} with arguments={arguments}")
    
    result = await session.call_tool(tool_name, arguments)
    
    if not result or not hasattr(result, "content"):
        return {}
        
    text_data = ""
    for item in result.content:
        if hasattr(item, "text") and item.text:
            text_data += item.text
            
    try:
        return json.loads(text_data)
    except json.JSONDecodeError:
        return {"result": text_data}


# TTL-aware in-memory cache for MCP tool calls (aligned with Kapruka's 30-min cache policy)
_CACHE_TTL_SECONDS = 1800  # 30 minutes

class _TTLCache:
    """Simple time-to-live cache to prevent unbounded growth and stale data."""
    def __init__(self, ttl: int = _CACHE_TTL_SECONDS):
        self._store: dict = {}
        self._ttl = ttl

    def get(self, key):
        entry = self._store.get(key)
        if entry and (time.time() - entry["ts"]) < self._ttl:
            return entry["value"]
        if entry:
            del self._store[key]  # evict expired entry
        return None

    def set(self, key, value):
        self._store[key] = {"value": value, "ts": time.time()}

    def __contains__(self, key):
        return self.get(key) is not None

    def __getitem__(self, key):
        return self.get(key)

    def __setitem__(self, key, value):
        self.set(key, value)


PRODUCT_SEARCH_CACHE = _TTLCache()
PRODUCT_GET_CACHE = _TTLCache()
DELIVERY_CHECK_CACHE = _TTLCache(ttl=900)  # 15 min for delivery info (more dynamic)


# ── Typed Wrapper Functions for the 7 Kapruka Tools ──────────────────────────

async def kapruka_search_products(query: str, limit: Optional[int] = None) -> dict:
    """Search Kapruka product catalog."""
    cache_key = (query, limit)
    if cache_key in PRODUCT_SEARCH_CACHE:
        logger.info(f"Returning cached product search results for: {cache_key}")
        return PRODUCT_SEARCH_CACHE[cache_key]

    params = {"q": query, "response_format": "json"}
    if limit is not None:
        params["limit"] = limit
    args = {"params": params}
    res = await with_rate_limit_backoff(_execute_mcp_tool, "kapruka_search_products", args)
    if isinstance(res, dict) and "results" in res:
        # Map fields for catalog_agent compatibility
        mapped_products = []
        for p in res["results"]:
            cat_val = p.get("category")
            if isinstance(cat_val, dict):
                cat_name = cat_val.get("name") or ""
            else:
                cat_name = str(cat_val or "")
                
            # Surface a real Kapruka product-page URL if the MCP provides one
            # (field name varies). The frontend uses this for the "Buy on Kapruka"
            # link and only constructs a fallback URL when this is absent.
            product_url = (
                p.get("url") or p.get("product_url") or p.get("link")
                or p.get("web_url") or p.get("permalink") or ""
            )
            mapped_p = {
                **p,
                "specs": p.get("summary") or "",
                "availability": "In Stock" if p.get("in_stock") else "Out of Stock",
                "stock": "In Stock" if p.get("in_stock") else "Out of Stock",
                "category": cat_name,
                "url": product_url,
                "product_url": product_url,
                "checkout_ready": p.get("in_stock", True)
            }
            mapped_products.append(mapped_p)
        final_res = {"products": mapped_products, "result": mapped_products}
        PRODUCT_SEARCH_CACHE[cache_key] = final_res
        return final_res
    PRODUCT_SEARCH_CACHE[cache_key] = res
    return res


async def kapruka_get_product(product_id: str) -> dict:
    """Retrieve detailed product specifications."""
    if product_id in PRODUCT_GET_CACHE:
        logger.info(f"Returning cached product details for ID: {product_id}")
        return PRODUCT_GET_CACHE[product_id]

    params = {"product_id": product_id, "response_format": "json"}
    args = {"params": params}
    res = await with_rate_limit_backoff(_execute_mcp_tool, "kapruka_get_product", args)
    if isinstance(res, dict):
        cat_val = res.get("category")
        if isinstance(cat_val, dict):
            cat_name = cat_val.get("name") or ""
        else:
            cat_name = str(cat_val or "")
        res["specs"] = res.get("description") or ""
        res["availability"] = "In Stock" if res.get("in_stock") else "Out of Stock"
        res["stock"] = "In Stock" if res.get("in_stock") else "Out of Stock"
        res["category"] = cat_name
        res["checkout_ready"] = res.get("in_stock", True)
    PRODUCT_GET_CACHE[product_id] = res
    return res


async def kapruka_list_categories() -> dict:
    """List all categories in Kapruka catalog."""
    args = {"params": {"depth": 2, "response_format": "json"}}
    return await with_rate_limit_backoff(_execute_mcp_tool, "kapruka_list_categories", args)


async def kapruka_list_delivery_cities(query: Optional[str] = None) -> dict:
    """List all supported delivery locations/cities in Sri Lanka."""
    params = {"limit": 50, "response_format": "json"}
    if query:
        params["query"] = query
    args = {"params": params}
    res = await with_rate_limit_backoff(_execute_mcp_tool, "kapruka_list_delivery_cities", args)
    if isinstance(res, dict) and "cities" in res:
        # Convert list of dicts to list of strings for logistics_agent compatibility
        city_names = [c.get("name") for c in res["cities"] if c.get("name")]
        return {"cities": city_names, "result": city_names}
    return res


async def kapruka_check_delivery(city: str) -> dict:
    """Check delivery availability and timing tier for a location."""
    city_clean = city.strip().lower()
    if city_clean in DELIVERY_CHECK_CACHE:
        logger.info(f"Returning cached delivery feasibility for: {city_clean}")
        return DELIVERY_CHECK_CACHE[city_clean]

    args = {"params": {"city": city, "response_format": "json"}}
    res = await with_rate_limit_backoff(_execute_mcp_tool, "kapruka_check_delivery", args)
    DELIVERY_CHECK_CACHE[city_clean] = res
    return res



async def kapruka_create_order(
    product_id: str,
    quantity: int,
    recipient_name: str,
    delivery_address: str,
    contact_number: str,
    gift_message: str = None,
    cart: list = None,
) -> dict:
    """Place a new gift order on Kapruka. Supports multi-item carts and gift messages."""
    import datetime
    
    # Try to extract city from delivery_address
    city = "Colombo 03"  # default
    addr_clean = delivery_address.lower()
    for possible_city in ["colombo", "kandy", "galle", "jaffna", "negombo", "gampaha", "kotte", "dehiwala", "moratuwa", "nugegoda"]:
        if possible_city in addr_clean:
            if possible_city == "colombo":
                city = "Colombo 03"
            elif possible_city == "kandy":
                city = "Kandy"
            elif possible_city == "galle":
                city = "Galle"
            elif possible_city == "jaffna":
                city = "Jaffna"
            else:
                city = possible_city.title()
            break
            
    tomorrow = (datetime.date.today() + datetime.timedelta(days=1)).isoformat()

    # Build cart array — use provided full cart if available, else single item
    if cart and len(cart) > 0:
        cart_payload = [
            {"product_id": str(item.get("product_id") or item.get("id") or product_id),
             "quantity": int(item.get("quantity", 1))}
            for item in cart
        ]
    else:
        cart_payload = [{"product_id": product_id, "quantity": quantity}]
    
    params = {
        "cart": cart_payload,
        "recipient": {
            "name": recipient_name,
            "phone": contact_number
        },
        "delivery": {
            "address": delivery_address,
            "city": city,
            "date": tomorrow
        },
        "sender": {
            "name": "Guest"
        },
        "response_format": "json"
    }

    # Add gift message if provided (bonus points feature)
    if gift_message and gift_message.strip():
        params["gift_message"] = gift_message.strip()
    
    args = {"params": params}
    return await with_rate_limit_backoff(_execute_mcp_tool, "kapruka_create_order", args)


async def kapruka_track_order(order_id: str) -> dict:
    """Track real-time shipment status of a Kapruka order."""
    args = {"params": {"order_number": order_id, "response_format": "json"}}
    return await with_rate_limit_backoff(_execute_mcp_tool, "kapruka_track_order", args)
