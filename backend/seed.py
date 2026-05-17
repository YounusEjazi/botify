"""Seed a single demo tenant so you can explore the dashboard right after install.

Run:  python seed.py
"""
from __future__ import annotations

import secrets

from app.db import SessionLocal, init_db
from app.models import Tenant


def main() -> None:
    init_db()
    db = SessionLocal()

    if db.query(Tenant).count() > 0:
        print("Tenants already exist — skipping seed.")
        return

    demo = Tenant(
        slug="demo",
        name="Demo Co.",
        allowed_origins=["*"],  # PERMISSIVE — only for local dev
        branding={
            "primary_color": "#5b58e0",
            "logo_url": "",
            "display_name": "Demo Bot",
        },
        languages=["en"],
        default_language="en",
        llm_config={},  # uses env defaults
        system_prompts={
            "en": (
                "You are a friendly support assistant. Always use the "
                "`search_knowledge_base` tool before answering substantive "
                "questions. Be concise."
            ),
        },
        ui_strings={
            "en": {
                "greeting": "Hi! How can I help?",
                "placeholder": "Ask me anything…",
                "title": "Demo Bot",
            }
        },
        guardrails_enabled=True,
        captcha_required=False,
        widget_api_key=secrets.token_urlsafe(24),
    )

    db.add(demo)
    db.commit()
    print(f"Created tenant: {demo.slug}")
    print(f"Demo widget key: {demo.widget_api_key}")


if __name__ == "__main__":
    main()
