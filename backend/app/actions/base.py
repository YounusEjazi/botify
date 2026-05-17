"""Action plugin protocol.

Every integration (Salesforce, Zendesk, webhook, email, ...) implements this.
The chat orchestrator calls `tool_schema()` to register the action with the
LLM, then `execute()` when the LLM invokes it.

Each action gets two config blobs from the Integration row:
  - public_config: non-secret stuff (webhook URL, field mapping, ticket subject template)
  - secret: credentials, decrypted from encrypted_secret on demand
"""
from __future__ import annotations

from typing import Any, Protocol

from ..models import Tenant


class Action(Protocol):
    kind: str  # matches Integration.kind

    def tool_schema(self, *, public_config: dict[str, Any], tenant: Tenant) -> dict[str, Any]:
        """Return the OpenAI function spec for this action.

        Schemas can vary by tenant — e.g. the Salesforce action may declare
        different fields based on the tenant's field mapping.
        """
        ...

    async def execute(
        self,
        *,
        args: dict[str, Any],
        public_config: dict[str, Any],
        secret: dict[str, Any],
        tenant: Tenant,
    ) -> dict[str, Any]:
        """Run the action. Return a dict to feed back into the chat thread."""
        ...
