"""Zendesk action — creates a ticket via the Zendesk REST API.

The tenant controls:
  - which Zendesk subdomain to use
  - default ticket priority, tags, group, and form

Public config:
  {
    "subdomain": "mycompany",
    "priority": "normal",
    "tags": ["chatbot"],
    "group_id": null,
    "ticket_form_id": null
  }

Secret:
  {"email": "admin@...", "api_token": "..."}
"""
from __future__ import annotations

import logging
from typing import Any

import httpx

from ..models import Tenant

logger = logging.getLogger(__name__)


class ZendeskAction:
    kind = "zendesk"

    def tool_schema(self, *, public_config: dict[str, Any], tenant: Tenant) -> dict[str, Any]:
        return {
            "type": "function",
            "function": {
                "name": "create_support_ticket",
                "description": (
                    "Create a support ticket when you cannot help the user further or "
                    "when they explicitly ask for one. Pass any details gathered from "
                    "the conversation; the user will be shown a form to confirm."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "subject": {"type": "string", "description": "Short summary of the issue."},
                        "description": {"type": "string", "description": "Full description."},
                        "name": {"type": "string", "description": "Customer name (optional)."},
                        "email": {"type": "string", "description": "Customer email (optional)."},
                    },
                    "required": ["subject", "description"],
                },
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
        # Don't actually call Zendesk here — the user still has to confirm
        # via the widget's ticket form. We just return the pre-filled fields.
        # The widget will POST to /create_ticket with the user-confirmed values.
        return {
            "status": "form_required",
            "data": "A ticket form has been opened for the user.",
            "prefill": {
                "subject": args.get("subject", ""),
                "description": args.get("description", ""),
                "name": args.get("name", ""),
                "email": args.get("email", ""),
            },
        }


async def test_zendesk_credentials(
    *,
    subdomain: str,
    email: str,
    api_token: str,
) -> tuple[bool, str]:
    """Verify credentials by GETting /api/v2/users/me.json with Basic auth."""
    if not subdomain:
        return False, "subdomain is required"
    if not (email and api_token):
        return False, "email and api_token are required"
    url = f"https://{subdomain}.zendesk.com/api/v2/users/me.json"
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.get(
                url,
                auth=(f"{email}/token", api_token),
            )
        if resp.status_code != 200:
            try:
                err = resp.json()
            except Exception:
                err = {"error": resp.text[:200]}
            return False, f"HTTP {resp.status_code}: {err.get('description') or err.get('error') or err}"
        return True, "OK"
    except httpx.HTTPError as exc:
        return False, f"Request failed: {exc}"


async def submit_zendesk_ticket(
    *,
    tenant: Tenant,
    public_config: dict[str, Any],
    secret: dict[str, Any],
    fields: dict[str, Any],
    description: str,
) -> dict[str, Any]:
    """Actually create the Zendesk ticket. Called from the /ticket endpoint after
    the user has confirmed via the form."""
    subdomain = public_config["subdomain"]
    url = f"https://{subdomain}.zendesk.com/api/v2/tickets.json"

    ticket: dict[str, Any] = {
        "subject": fields.get("subject", "Untitled"),
        "comment": {"body": description},
        "requester": {
            "name": fields.get("name", ""),
            "email": fields.get("email", ""),
        },
        "priority": public_config.get("priority", "normal"),
        "tags": public_config.get("tags", ["chatbot"]),
    }

    if public_config.get("group_id") is not None:
        ticket["group_id"] = public_config["group_id"]
    if public_config.get("ticket_form_id") is not None:
        ticket["ticket_form_id"] = public_config["ticket_form_id"]

    email = secret["email"]
    api_token = secret["api_token"]

    async with httpx.AsyncClient(timeout=40.0) as client:
        resp = await client.post(
            url,
            json={"ticket": ticket},
            auth=(f"{email}/token", api_token),
        )
        resp.raise_for_status()
        data = resp.json()

    ticket_id = data["ticket"]["id"]
    return {
        "status": "success",
        "ticket_id": str(ticket_id),
        "ticket_url": f"https://{subdomain}.zendesk.com/hc/requests/{ticket_id}",
    }
