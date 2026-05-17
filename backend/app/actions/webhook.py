"""Generic outbound webhook.

A tenant configures a URL + (optionally) HMAC secret + (optionally) a
collection schema. When the LLM calls the action, we POST the arguments to the
URL. This is the easiest way to integrate with any ticketing system, CRM, or
custom backend — your customer just exposes one endpoint on their side.

Public config:
  {
    "url": "https://acme.example.com/chatbot-webhook",
    "tool_name": "create_ticket",
    "tool_description": "Create a support ticket in our system.",
    "fields": [
        {"name": "subject", "type": "string", "description": "...", "required": true},
        {"name": "email", "type": "string", "description": "...", "required": false},
        ...
    ]
  }

Secret:
  {"hmac_secret": "...", "auth_header": "Bearer ..."}
"""
from __future__ import annotations

import hashlib
import hmac
import json
from typing import Any

import httpx

from ..models import Tenant


class WebhookAction:
    kind = "webhook"

    def tool_schema(self, *, public_config: dict[str, Any], tenant: Tenant) -> dict[str, Any]:
        fields = public_config.get("fields") or []
        properties: dict[str, Any] = {}
        required: list[str] = []

        for f in fields:
            properties[f["name"]] = {
                "type": f.get("type", "string"),
                "description": f.get("description", ""),
            }
            if f.get("required"):
                required.append(f["name"])

        return {
            "type": "function",
            "function": {
                "name": public_config.get("tool_name") or "submit_webhook",
                "description": public_config.get("tool_description")
                or f"Send data to {tenant.name}'s configured webhook.",
                "parameters": {
                    "type": "object",
                    "properties": properties,
                    "required": required,
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
        url = public_config.get("url")
        if not url:
            return {"status": "error", "error": "Webhook URL not configured", "data": ""}

        payload = {"tenant_slug": tenant.slug, "args": args}
        body = json.dumps(payload).encode("utf-8")

        headers = {"content-type": "application/json"}
        if auth := secret.get("auth_header"):
            headers["authorization"] = auth
        if hmac_secret := secret.get("hmac_secret"):
            sig = hmac.new(hmac_secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
            headers["x-signature-sha256"] = sig

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(url, content=body, headers=headers)
            ok = 200 <= resp.status_code < 300
            return {
                "status": "success" if ok else "error",
                "http_status": resp.status_code,
                "data": resp.text[:2000],
            }
        except Exception as exc:
            return {"status": "error", "error": str(exc), "data": ""}
