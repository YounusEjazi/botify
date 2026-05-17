"""Action registry.

Each `kind` string maps to one Action class. Adding a new integration means
writing one new class and one line here.
"""
from __future__ import annotations

import logging
from typing import Any

from sqlalchemy.orm import Session

from ..crypto import decrypt_dict
from ..models import Integration, Tenant
from .base import Action
from .email import EmailAction
from .salesforce import SalesforceAction
from .webhook import WebhookAction

logger = logging.getLogger(__name__)

REGISTRY: dict[str, type[Action]] = {
    SalesforceAction.kind: SalesforceAction,
    WebhookAction.kind: WebhookAction,
    EmailAction.kind: EmailAction,
}


def build_tools_for_tenant(tenant: Tenant, db: Session) -> list[dict[str, Any]]:
    """Build the OpenAI tool list for each enabled integration."""
    tools: list[dict[str, Any]] = []
    for integration in tenant.integrations:
        if not integration.enabled:
            continue
        cls = REGISTRY.get(integration.kind)
        if not cls:
            logger.warning("Unknown integration kind: %s", integration.kind)
            continue
        action = cls()
        # We track the tool's function name so we can route it back at execute time.
        schema = action.tool_schema(public_config=integration.config, tenant=tenant)
        tools.append(schema)
    return tools


async def execute_action(
    *, name: str, args: dict[str, Any], tenant: Tenant, db: Session
) -> dict[str, Any]:
    """Find the integration whose tool has this function name and dispatch."""
    for integration in tenant.integrations:
        if not integration.enabled:
            continue
        cls = REGISTRY.get(integration.kind)
        if not cls:
            continue
        action = cls()
        schema = action.tool_schema(public_config=integration.config, tenant=tenant)
        if schema["function"]["name"] == name:
            secret = decrypt_dict(integration.encrypted_secret)
            return await action.execute(
                args=args,
                public_config=integration.config,
                secret=secret,
                tenant=tenant,
            )

    return {"status": "error", "error": f"No integration found for tool {name!r}", "data": ""}
