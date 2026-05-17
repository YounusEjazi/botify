"""Salesforce action — creates a Case via the Composite API.

The tenant controls:
  - which Salesforce org (instance_url, token_url)
  - which custom fields to set on the Case (field_map)
  - the Case Origin and default Status
  - locale handling

Public config:
  {
    "instance_url": "https://acme.my.salesforce.com",
    "token_url": "https://acme.my.salesforce.com/services/oauth2/token",
    "api_version": "v61.0",
    "case_origin": "Chatbot",            # whatever value your Salesforce org accepts
    "default_status": "New",
    "field_map": {                       # any custom fields to set on every Case
        "Custom_Field__c": "value"
    }
  }

Secret:
  {"client_id": "...", "client_secret": "..."}
"""
from __future__ import annotations

import logging
from typing import Any

import httpx

from ..models import Tenant

logger = logging.getLogger(__name__)


class SalesforceAction:
    kind = "salesforce"

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
        # Don't actually call Salesforce here — the user still has to confirm
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


async def test_salesforce_credentials(
    *,
    instance_url: str,
    token_url: str | None,
    client_id: str,
    client_secret: str,
) -> tuple[bool, str]:
    """Verify OAuth client_credentials by requesting an access token. No Case created."""
    if not instance_url:
        return False, "instance_url is required"
    if not (client_id and client_secret):
        return False, "client_id and client_secret are required"
    token_url = token_url or f"{instance_url.rstrip('/')}/services/oauth2/token"
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.post(
                token_url,
                data={
                    "grant_type": "client_credentials",
                    "client_id": client_id,
                    "client_secret": client_secret,
                },
            )
        if resp.status_code != 200:
            try:
                err = resp.json()
            except Exception:
                err = {"error": resp.text[:200]}
            return False, f"HTTP {resp.status_code}: {err.get('error_description') or err.get('error') or err}"
        return True, "OK"
    except httpx.HTTPError as exc:
        return False, f"Request failed: {exc}"


async def submit_salesforce_case(
    *,
    tenant: Tenant,
    public_config: dict[str, Any],
    secret: dict[str, Any],
    fields: dict[str, Any],
    description: str,
    files: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Actually create the Case. Called from the /create_ticket endpoint after
    the user has confirmed via the form."""
    import base64
    import json

    instance_url = public_config["instance_url"]
    token_url = public_config.get("token_url") or f"{instance_url}/services/oauth2/token"
    api_version = public_config.get("api_version", "v61.0")
    composite_url = f"{instance_url}/services/data/{api_version}/composite"

    async with httpx.AsyncClient(timeout=40.0) as client:
        token_resp = await client.post(
            token_url,
            data={
                "grant_type": "client_credentials",
                "client_id": secret["client_id"],
                "client_secret": secret["client_secret"],
            },
        )
        token_resp.raise_for_status()
        access_token = token_resp.json()["access_token"]

        case_body: dict[str, Any] = {
            "SuppliedEmail": fields.get("email", ""),
            "SuppliedName": fields.get("name", ""),
            "Subject": fields.get("subject", "Untitled"),
            "Description": description,
            "Status": public_config.get("default_status", "New"),
        }
        # Origin is optional — only set if the tenant configured one.
        if origin := public_config.get("case_origin"):
            case_body["Origin"] = origin
        # Merge in tenant-specific custom fields.
        case_body.update(public_config.get("field_map", {}))

        composite_requests: list[dict[str, Any]] = [
            {
                "method": "POST",
                "url": f"/services/data/{api_version}/sobjects/Case",
                "referenceId": "refCase",
                "httpHeaders": {"Sforce-Auto-Assign": "FALSE"},
                "body": case_body,
            },
            {
                "method": "GET",
                "url": f"/services/data/{api_version}/sobjects/Case/@{{refCase.id}}?fields=CaseNumber",
                "referenceId": "refCaseNumber",
            },
        ]

        for idx, f in enumerate((files or [])[:20]):
            content_bytes: bytes = f.get("content") or b""
            filename = f.get("filename") or f"file{idx}"
            composite_requests.append(
                {
                    "method": "POST",
                    "url": f"/services/data/{api_version}/sobjects/ContentVersion",
                    "referenceId": f"refFile{idx}",
                    "body": {
                        "ContentLocation": "S",
                        "PathOnClient": filename,
                        "Title": filename.rsplit(".", 1)[0][:80],
                        "FirstPublishLocationId": "@{refCase.id}",
                        "VersionData": base64.b64encode(content_bytes).decode(),
                    },
                }
            )

        resp = await client.post(
            composite_url,
            json={"allOrNone": False, "compositeRequest": composite_requests},
            headers={"Authorization": f"Bearer {access_token}"},
        )
        resp.raise_for_status()
        data = resp.json()

    comp = data.get("compositeResponse", [])
    case_resp = next((c for c in comp if c.get("referenceId") == "refCase"), None)
    case_number = next(
        (
            c.get("body", {}).get("CaseNumber")
            for c in comp
            if c.get("referenceId") == "refCaseNumber" and c.get("httpStatusCode") == 200
        ),
        None,
    )
    if not case_resp or case_resp.get("httpStatusCode") not in (200, 201):
        raise RuntimeError(f"Case creation failed: {json.dumps(case_resp)}")

    return {
        "status": "success",
        "case_id": case_number or case_resp.get("body", {}).get("id"),
    }
