"""MCP (Model Context Protocol) client action.

Lets tenants plug in any MCP-compatible server as a tool source.
The client discovers tools dynamically at request time and proxies calls.

Public config:
  {
    "server_url": "https://mcp.example.com/mcp",
    "server_name": "My MCP Server",
    "auth_header": "Authorization"  # optional, header name for auth
  }

Secret:
  {"auth_token": "Bearer sk-..."}  # value for the auth header, if any
"""
from __future__ import annotations

import logging
import uuid
from typing import Any

import httpx

from ..models import Tenant

logger = logging.getLogger(__name__)
MCP_TIMEOUT = 30.0


class MCPClient:
    kind = "mcp"

    def tool_schema(self, *, public_config: dict[str, Any], tenant: Tenant) -> dict[str, Any]:
        # MCP is special — we return a placeholder schema here.
        # The orchestrator calls `fetch_mcp_tools()` separately to get the real list.
        # This placeholder is never used for tool calling; it just signals MCP presence.
        return {
            "type": "function",
            "function": {
                "name": "__mcp_placeholder__",
                "description": "MCP server placeholder — real tools loaded dynamically",
                "parameters": {"type": "object", "properties": {}},
            },
        }

    async def execute(
        self,
        *,
        args: dict[str, Any],
        public_config: dict[str, Any],
        secret: dict[str, Any],
        tenant: Tenant,
    ) -> dict[str, Any]:
        # Should never be called via the normal registry path
        return {"status": "error", "error": "Use call_mcp_tool() directly"}


def _make_headers(public_config: dict[str, Any], secret: dict[str, Any]) -> dict[str, str]:
    headers = {"content-type": "application/json"}
    auth_header = public_config.get("auth_header", "Authorization")
    auth_token = secret.get("auth_token", "")
    if auth_token:
        headers[auth_header] = auth_token
    return headers


async def _jsonrpc(
    server_url: str,
    method: str,
    params: dict[str, Any],
    headers: dict[str, str],
) -> Any:
    payload = {
        "jsonrpc": "2.0",
        "id": str(uuid.uuid4()),
        "method": method,
        "params": params,
    }
    async with httpx.AsyncClient(timeout=MCP_TIMEOUT) as client:
        resp = await client.post(server_url, json=payload, headers=headers)
        resp.raise_for_status()
        data = resp.json()
    if "error" in data:
        raise RuntimeError(f"MCP error: {data['error']}")
    return data.get("result")


async def fetch_mcp_tools(
    *, public_config: dict[str, Any], secret: dict[str, Any]
) -> list[dict[str, Any]]:
    """Discover tools from the MCP server. Returns OpenAI-format tool schemas."""
    server_url = public_config.get("server_url", "")
    if not server_url:
        return []
    headers = _make_headers(public_config, secret)
    try:
        # MCP initialize handshake
        await _jsonrpc(
            server_url,
            "initialize",
            {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {"name": "botify", "version": "1.0"},
            },
            headers,
        )
        # List tools
        result = await _jsonrpc(server_url, "tools/list", {}, headers)
        raw_tools = result.get("tools", []) if result else []
        # Convert MCP tool schemas to OpenAI format
        tools = []
        for t in raw_tools:
            tools.append({
                "type": "function",
                "function": {
                    "name": f"mcp__{t['name']}",  # prefix to avoid collisions
                    "description": t.get("description", ""),
                    "parameters": t.get("inputSchema", {"type": "object", "properties": {}}),
                },
            })
        return tools
    except Exception as exc:
        logger.warning("Failed to fetch MCP tools from %s: %s", server_url, exc)
        return []


async def call_mcp_tool(
    *,
    tool_name: str,  # with "mcp__" prefix
    args: dict[str, Any],
    public_config: dict[str, Any],
    secret: dict[str, Any],
) -> dict[str, Any]:
    """Call an MCP tool and return the result."""
    server_url = public_config.get("server_url", "")
    if not server_url:
        return {"status": "error", "error": "No MCP server URL configured"}

    # Strip the "mcp__" prefix to get the real tool name
    real_name = tool_name[5:] if tool_name.startswith("mcp__") else tool_name
    headers = _make_headers(public_config, secret)

    try:
        # Handshake
        await _jsonrpc(
            server_url,
            "initialize",
            {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {"name": "botify", "version": "1.0"},
            },
            headers,
        )
        result = await _jsonrpc(
            server_url,
            "tools/call",
            {"name": real_name, "arguments": args},
            headers,
        )
        # MCP returns content array: [{"type": "text", "text": "..."}]
        content_list = result.get("content", []) if result else []
        text_parts = [c.get("text", "") for c in content_list if c.get("type") == "text"]
        return {
            "status": "success",
            "data": "\n".join(text_parts),
            "raw": result,
        }
    except Exception as exc:
        logger.warning("MCP tool call failed: %s", exc)
        return {"status": "error", "error": str(exc), "data": ""}
