"""Query rewriter for conversational context.

When a user asks a follow-up like "what about pricing?" the knowledge-base
search fails because there is no subject. This module rewrites such queries
into standalone questions using the conversation history, so the retrieval
step always gets a well-formed query.

Deliberately kept cheap: one small LLM call, max 60 tokens output, fast fail.
"""
from __future__ import annotations

import logging
from typing import Any

from . import llm

logger = logging.getLogger(__name__)

_SYSTEM = (
    "You are a search-query rewriter. "
    "Given a conversation and a potentially vague follow-up query, "
    "rewrite the query as a complete, self-contained question that can be "
    "understood without reading the conversation. "
    "Output ONLY the rewritten query — no explanation, no quotes, no prefix."
)

_EXAMPLES = (
    "Examples:\n"
    "  history: user asked about 'return policy'  →  query 'how long?' "
    "→ 'How long is the return window?'\n"
    "  history: user asked about 'Pro plan'       →  query 'what is included?' "
    "→ 'What is included in the Pro plan?'\n"
    "  history: (empty)                           →  query 'pricing' "
    "→ 'What is the pricing?'\n"
)


def _needs_rewrite(query: str, history: list[dict]) -> bool:
    """Skip the rewrite if the query is clearly standalone or history is empty."""
    user_turns = [m for m in history if m.get("role") == "user"]
    if len(user_turns) <= 1:
        return False
    q = query.strip()
    # Short vague fragments are the main target.
    if len(q.split()) >= 8:
        return False
    return True


async def rewrite_query(
    query: str,
    history: list[dict],
    tenant_llm_config: dict[str, Any],
) -> str:
    """Return a standalone version of `query` given the conversation `history`.

    Falls back to the original query on any failure so retrieval always runs.
    `history` is the OpenAI-style thread (role/content dicts) — system message
    excluded.
    """
    if not _needs_rewrite(query, history):
        return query

    # Use the last 6 messages for context (3 turns), keeping the prompt short.
    recent = [m for m in history if m.get("role") in ("user", "assistant")][-6:]
    history_text = "\n".join(
        f"{m['role'].capitalize()}: {str(m.get('content', ''))[:200]}"
        for m in recent
    )

    prompt = (
        f"{_EXAMPLES}\n"
        f"Conversation so far:\n{history_text}\n\n"
        f"Query to rewrite: {query}\n"
        f"Rewritten query:"
    )

    try:
        cfg = {**tenant_llm_config, "max_tokens": 60, "temperature": 0.0}
        response = await llm.chat_completion(
            messages=[
                {"role": "system", "content": _SYSTEM},
                {"role": "user", "content": prompt},
            ],
            tenant_llm_config=cfg,
        )
        rewritten = (response.choices[0].message.content or "").strip().strip('"').strip("'")
        if rewritten and len(rewritten) < 300:
            logger.debug("Query rewrite: %r → %r", query, rewritten)
            return rewritten
    except Exception:
        logger.warning("Query rewrite failed for query=%r; using original", query)

    return query
