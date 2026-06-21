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
from mcp.client.sse import sse_client

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


class KaprukaMCPClient:
    """
    Async Context Manager to establish and maintain an SSE connection session
    with the Kapruka remote MCP server.
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

            # Step 2: Custom client factory to inject RateLimitedAsyncClient and set headers
            @asynccontextmanager
            async def client_factory(headers=None, auth=None, timeout=None):
                if headers is None:
                    headers = {}
                headers["mcp-session-id"] = session_id
                
                client = RateLimitedAsyncClient(headers=headers, auth=auth, timeout=timeout)
                self.http_client = client
                async with client:
                    yield client
            
            # Connect using sse_client with our custom factory and headers
            connection_headers = {"mcp-session-id": session_id}
            read, write = await self._exit_stack.enter_async_context(
                sse_client(
                    url=self.sse_url,
                    headers=connection_headers,
                    httpx_client_factory=client_factory
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


# ── Typed Wrapper Functions for the 7 Kapruka Tools ──────────────────────────

async def kapruka_search_products(query: str, limit: Optional[int] = None) -> dict:
    """Search Kapruka product catalog."""
    args = {"query": query}
    if limit is not None:
        args["limit"] = limit
    return await with_rate_limit_backoff(_execute_mcp_tool, "kapruka_search_products", args)


async def kapruka_get_product(product_id: str) -> dict:
    """Retrieve detailed product specifications."""
    args = {"product_id": product_id}
    return await with_rate_limit_backoff(_execute_mcp_tool, "kapruka_get_product", args)


async def kapruka_list_categories() -> dict:
    """List all categories in Kapruka catalog."""
    return await with_rate_limit_backoff(_execute_mcp_tool, "kapruka_list_categories", {})


async def kapruka_list_delivery_cities() -> dict:
    """List all supported delivery locations/cities in Sri Lanka."""
    return await with_rate_limit_backoff(_execute_mcp_tool, "kapruka_list_delivery_cities", {})


async def kapruka_check_delivery(city: str) -> dict:
    """Check delivery availability and timing tier for a location."""
    args = {"city": city}
    return await with_rate_limit_backoff(_execute_mcp_tool, "kapruka_check_delivery", args)


async def kapruka_create_order(
    product_id: str,
    quantity: int,
    recipient_name: str,
    delivery_address: str,
    contact_number: str
) -> dict:
    """Place a new gift order on Kapruka."""
    args = {
        "product_id": product_id,
        "quantity": quantity,
        "recipient_name": recipient_name,
        "delivery_address": delivery_address,
        "contact_number": contact_number
    }
    return await with_rate_limit_backoff(_execute_mcp_tool, "kapruka_create_order", args)


async def kapruka_track_order(order_id: str) -> dict:
    """Track real-time shipment status of a Kapruka order."""
    args = {"order_id": order_id}
    return await with_rate_limit_backoff(_execute_mcp_tool, "kapruka_track_order", args)
