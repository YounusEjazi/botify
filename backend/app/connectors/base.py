from __future__ import annotations

from typing import Any, Protocol


class Connector(Protocol):
    kind: str

    async def fetch_pages(
        self, *, config: dict[str, Any], secret: dict[str, Any]
    ) -> list[dict[str, Any]]:
        """Return list of {title, content, source_url} dicts."""
        ...
