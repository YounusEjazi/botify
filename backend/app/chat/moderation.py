"""LLM-based moderation classifier.

Intentionally minimal — single LLM classifier call returning structured JSON.
For production you may also want OpenAI's moderation endpoint or Azure Content
Safety as a second layer.
"""
from __future__ import annotations

import json
import logging
from typing import Any

from . import llm

logger = logging.getLogger(__name__)

_SYSTEM = (
    "You are a strict content classifier. Analyze the text and return JSON with "
    "fields:\n"
    '  status: "allowed" | "not_allowed"\n'
    "  category: one of [violence, hate, sexual, self_harm, prompt_attack, "
    "indirect_attack, nonsense, pii] — required if status is not_allowed.\n"
    "Be precise: 'I hate you' is hate (personal attack), not nonsense. "
    "Random letters like 'asdfghjkl' are nonsense, not hate. "
    "Return ONLY valid JSON, no commentary."
)

_VALID_CATEGORIES = {
    "violence", "hate", "sexual", "self_harm",
    "prompt_attack", "indirect_attack", "nonsense", "pii",
}


async def moderate(
    text: str, tenant_llm_config: dict[str, Any] | None = None
) -> tuple[bool, str | None]:
    """Returns (is_allowed, category_or_none)."""
    if not text or not text.strip():
        return True, None

    messages = [
        {"role": "system", "content": _SYSTEM},
        {"role": "user", "content": text[:4000]},
    ]
    try:
        resp = await llm.chat_completion(
            messages=messages,
            temperature=0.0,
            tenant_llm_config=tenant_llm_config,
        )
        raw = (resp.choices[0].message.content or "").strip()
        # Strip code fences if the model added them.
        if raw.startswith("```"):
            raw = raw.split("```")[1].lstrip("json").strip()
        data = json.loads(raw)
        status = str(data.get("status", "")).lower()
        if status == "not_allowed":
            cat = str(data.get("category", "nonsense")).lower()
            if cat not in _VALID_CATEGORIES:
                cat = "nonsense"
            return False, cat
        return True, None
    except Exception as exc:
        # Fail open: don't block legitimate users because the classifier hiccupped.
        # Log it so you can monitor false negatives.
        logger.warning("Moderation classifier failed (failing open): %s", exc)
        return True, None
