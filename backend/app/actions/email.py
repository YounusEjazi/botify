"""Email handoff action.

Sends an email when the LLM decides the user needs human follow-up. This is
the simplest possible escalation path — use it when a tenant doesn't have a
CRM yet.

Public config:
  {"to_addresses": ["support@acme.com"], "from_address": "bot@yours.com",
   "smtp_host": "smtp.example.com", "smtp_port": 587, "smtp_use_tls": true,
   "subject_prefix": "[Chatbot] "}

Secret:
  {"smtp_user": "...", "smtp_password": "..."}
"""
from __future__ import annotations

import logging
import smtplib
from email.message import EmailMessage
from typing import Any

from ..models import Tenant

logger = logging.getLogger(__name__)


class EmailAction:
    kind = "email"

    def tool_schema(self, *, public_config: dict[str, Any], tenant: Tenant) -> dict[str, Any]:
        return {
            "type": "function",
            "function": {
                "name": "send_handoff_email",
                "description": (
                    "Send an email to the support team when you cannot resolve the user's "
                    "issue. Summarize the conversation in the body."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "subject": {"type": "string"},
                        "summary": {
                            "type": "string",
                            "description": "Brief summary of the issue and what was already tried.",
                        },
                        "user_email": {"type": "string"},
                        "user_name": {"type": "string"},
                    },
                    "required": ["subject", "summary"],
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
        to_addrs = public_config.get("to_addresses") or []
        if not to_addrs:
            return {"status": "error", "error": "No recipients configured", "data": ""}

        msg = EmailMessage()
        msg["Subject"] = (public_config.get("subject_prefix") or "") + args.get("subject", "Untitled")
        msg["From"] = public_config["from_address"]
        msg["To"] = ", ".join(to_addrs)

        body = (
            f"Tenant: {tenant.name}\n"
            f"User: {args.get('user_name', 'unknown')} <{args.get('user_email', '')}>\n\n"
            f"{args.get('summary', '')}\n"
        )
        msg.set_content(body)

        try:
            host = public_config["smtp_host"]
            port = int(public_config.get("smtp_port", 587))
            with smtplib.SMTP(host, port) as smtp:
                if public_config.get("smtp_use_tls", True):
                    smtp.starttls()
                if secret.get("smtp_user"):
                    smtp.login(secret["smtp_user"], secret["smtp_password"])
                smtp.send_message(msg)
            return {"status": "success", "data": "Email sent to support team."}
        except Exception as exc:
            logger.exception("Email send failed for tenant=%s", tenant.slug)
            return {"status": "error", "error": str(exc), "data": ""}
