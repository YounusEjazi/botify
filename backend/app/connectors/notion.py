"""Notion connector — fetches pages from databases and standalone page IDs."""
from __future__ import annotations

import logging
from typing import Any

import httpx

logger = logging.getLogger(__name__)

NOTION_API_BASE = "https://api.notion.com/v1"
NOTION_VERSION = "2022-06-28"


class NotionConnector:
    kind = "notion"

    async def fetch_pages(
        self, *, config: dict[str, Any], secret: dict[str, Any]
    ) -> list[dict[str, Any]]:
        """Fetch pages from Notion databases and/or standalone page IDs.

        config shape:
            {"database_ids": ["abc123", ...], "page_ids": ["def456", ...]}
        secret shape:
            {"api_key": "secret_..."}
        """
        api_key = secret.get("api_key", "")
        if not api_key:
            raise ValueError("Notion connector requires 'api_key' in secret")

        headers = {
            "Authorization": f"Bearer {api_key}",
            "Notion-Version": NOTION_VERSION,
            "Content-Type": "application/json",
        }

        pages: list[dict[str, Any]] = []

        async with httpx.AsyncClient(timeout=30.0) as client:
            # Fetch pages from each database
            for db_id in config.get("database_ids", []):
                db_pages = await self._query_database(client, headers, db_id)
                pages.extend(db_pages)

            # Fetch standalone page IDs
            for page_id in config.get("page_ids", []):
                page = await self._fetch_page(client, headers, page_id)
                if page:
                    pages.append(page)

        return pages

    async def _query_database(
        self,
        client: httpx.AsyncClient,
        headers: dict[str, str],
        database_id: str,
    ) -> list[dict[str, Any]]:
        """Query a Notion database and fetch content for each result page."""
        pages = []
        start_cursor: str | None = None

        while True:
            body: dict[str, Any] = {"page_size": 100}
            if start_cursor:
                body["start_cursor"] = start_cursor

            resp = await client.post(
                f"{NOTION_API_BASE}/databases/{database_id}/query",
                headers=headers,
                json=body,
            )
            resp.raise_for_status()
            data = resp.json()

            for notion_page in data.get("results", []):
                page = await self._page_to_doc(client, headers, notion_page)
                if page:
                    pages.append(page)

            if not data.get("has_more"):
                break
            start_cursor = data.get("next_cursor")

        return pages

    async def _fetch_page(
        self,
        client: httpx.AsyncClient,
        headers: dict[str, str],
        page_id: str,
    ) -> dict[str, Any] | None:
        """Fetch a single Notion page and its content blocks."""
        try:
            resp = await client.get(
                f"{NOTION_API_BASE}/pages/{page_id}",
                headers=headers,
            )
            resp.raise_for_status()
            notion_page = resp.json()
            return await self._page_to_doc(client, headers, notion_page)
        except httpx.HTTPStatusError as exc:
            logger.warning("Failed to fetch Notion page %s: %s", page_id, exc)
            return None

    async def _page_to_doc(
        self,
        client: httpx.AsyncClient,
        headers: dict[str, str],
        notion_page: dict[str, Any],
    ) -> dict[str, Any] | None:
        """Convert a Notion page object + blocks into a {title, content, source_url} doc."""
        page_id = notion_page.get("id", "")
        if not page_id:
            return None

        # Extract title from properties
        title = _extract_title(notion_page)

        # Get page URL
        source_url = notion_page.get("url", f"https://notion.so/{page_id.replace('-', '')}")

        # Fetch content blocks
        content = await self._fetch_blocks_text(client, headers, page_id)

        return {
            "title": title or "Untitled",
            "content": content,
            "source_url": source_url,
        }

    async def _fetch_blocks_text(
        self,
        client: httpx.AsyncClient,
        headers: dict[str, str],
        block_id: str,
    ) -> str:
        """Recursively fetch block children and render as plain text."""
        lines: list[str] = []
        start_cursor: str | None = None

        while True:
            params: dict[str, Any] = {"page_size": 100}
            if start_cursor:
                params["start_cursor"] = start_cursor

            try:
                resp = await client.get(
                    f"{NOTION_API_BASE}/blocks/{block_id}/children",
                    headers=headers,
                    params=params,
                )
                resp.raise_for_status()
                data = resp.json()
            except httpx.HTTPStatusError as exc:
                logger.warning("Failed to fetch blocks for %s: %s", block_id, exc)
                break

            for block in data.get("results", []):
                text = _block_to_text(block)
                if text:
                    lines.append(text)
                # Recurse into child blocks for toggled/nested blocks
                if block.get("has_children"):
                    child_text = await self._fetch_blocks_text(client, headers, block["id"])
                    if child_text:
                        lines.append(child_text)

            if not data.get("has_more"):
                break
            start_cursor = data.get("next_cursor")

        return "\n\n".join(lines)


def _extract_title(notion_page: dict[str, Any]) -> str:
    """Pull the title out of a Notion page's properties."""
    properties = notion_page.get("properties", {})
    for prop in properties.values():
        if prop.get("type") == "title":
            title_items = prop.get("title", [])
            return "".join(t.get("plain_text", "") for t in title_items)
    return ""


def _block_to_text(block: dict[str, Any]) -> str:
    """Extract plain text from a Notion block object."""
    block_type = block.get("type", "")
    block_data = block.get(block_type, {})

    # Most block types have a "rich_text" array
    rich_text = block_data.get("rich_text", [])
    text = "".join(t.get("plain_text", "") for t in rich_text)

    # For code blocks, wrap in a simple marker
    if block_type == "code":
        lang = block_data.get("language", "")
        return f"[code:{lang}]\n{text}\n[/code]" if text else ""

    # For dividers, emit a separator
    if block_type == "divider":
        return "---"

    return text
