"""The chat orchestrator: prompt → moderation → tool loop → answer.

This is the per-request entry point. It's tenant-aware: everything that could
otherwise be a global or hardcoded value (system prompt, tools, LLM config, KB
filter) now comes from the tenant.

Tool execution is fan-out: actions defined per-tenant are registered with the
LLM as functions, and when the model calls one we hand off to the registry.
"""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy.orm import Session

from ..actions.registry import build_tools_for_tenant, execute_action
from ..models import Tenant
from ..rag.store import VectorStore, get_vector_store
from . import llm, moderation

logger = logging.getLogger(__name__)

MAX_TOOL_LOOPS = 4


@dataclass
class ChatTurnResult:
    answer: str
    actions: list[dict[str, Any]] = field(default_factory=list)
    blocked: bool = False
    block_reason: str | None = None
    sources: list[dict[str, Any]] = field(default_factory=list)


def _build_knowledge_tool(tenant: Tenant) -> dict[str, Any]:
    """The one tool every tenant gets for free: knowledge-base lookup."""
    return {
        "type": "function",
        "function": {
            "name": "search_knowledge_base",
            "description": (
                f"Search {tenant.name}'s knowledge base for facts to answer the "
                "user. Call this BEFORE answering any substantive question. "
                "Return up to `k` relevant chunks of text."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Concise search query."},
                    "k": {"type": "integer", "description": "Max results, default 5.", "default": 5},
                },
                "required": ["query"],
            },
        },
    }


async def _execute_tool_call(
    *,
    name: str,
    args: dict[str, Any],
    tenant: Tenant,
    db: Session,
    store: VectorStore,
) -> dict[str, Any]:
    """Dispatch a single tool call. Returns the result payload for the LLM."""
    if name == "search_knowledge_base":
        query = (args.get("query") or "").strip()
        k = int(args.get("k", 5))
        if not query:
            return {"data": "", "hits": [], "error": "Empty query"}

        hits = await store.search(tenant_id=tenant.id, query=query, k=k, db=db, tenant=tenant)
        # `data` is what the LLM sees; `hits` is structured for the UI.
        return {
            "data": "\n\n---\n\n".join(h["content"] for h in hits),
            "hits": hits,
        }

    # Otherwise dispatch to the per-tenant action registry.
    return await execute_action(name=name, args=args, tenant=tenant, db=db)


async def run_chat_turn(
    *,
    tenant: Tenant,
    messages: list[dict[str, Any]],
    language: str | None = None,
    db: Session,
) -> ChatTurnResult:
    """Process a chat turn end-to-end.

    `messages` is the OpenAI-style history: [{role, content}, ...]. The system
    prompt is added by us based on tenant + language. The caller does NOT pass
    a system message.
    """
    lang = language or tenant.default_language
    system_prompt = (
        tenant.system_prompts.get(lang)
        or tenant.system_prompts.get(tenant.default_language)
        or "You are a helpful assistant."
    )
    llm_cfg = llm.effective_llm_config(tenant)

    actions: list[dict[str, Any]] = []
    sources: list[dict[str, Any]] = []

    # ── Guardrail on the latest user message ───────────────────────────
    if tenant.guardrails_enabled:
        last_user = next((m for m in reversed(messages) if m.get("role") == "user"), None)
        if last_user:
            allowed, category = await moderation.moderate(
                last_user.get("content", ""), tenant_llm_config=llm_cfg
            )
            if not allowed:
                logger.info("Blocked user message for tenant=%s category=%s", tenant.slug, category)
                return ChatTurnResult(
                    answer="",
                    blocked=True,
                    block_reason=category,
                    actions=[{"tool": "guardrail", "result": {"blocked": True, "category": category}}],
                )

    # ── Build tool list ────────────────────────────────────────────────
    tools = [_build_knowledge_tool(tenant)]
    tools.extend(build_tools_for_tenant(tenant, db))

    thread: list[dict[str, Any]] = [{"role": "system", "content": system_prompt}]
    thread.extend(m for m in messages if m.get("role") in ("user", "assistant"))

    store = get_vector_store()

    # ── Tool-calling loop ──────────────────────────────────────────────
    for _ in range(MAX_TOOL_LOOPS):
        response = await llm.chat_completion(
            messages=thread,
            tools=tools,
            tenant_llm_config=llm_cfg,
        )
        assistant_msg = response.choices[0].message
        tool_calls = getattr(assistant_msg, "tool_calls", None) or []

        if not tool_calls:
            content = (assistant_msg.content or "").strip()
            return ChatTurnResult(answer=content, actions=actions, sources=sources)

        # Record assistant turn + tool calls in the thread so the model can see
        # its own previous calls.
        thread.append(
            {
                "role": "assistant",
                "content": assistant_msg.content or "",
                "tool_calls": [
                    {
                        "id": tc.id,
                        "type": "function",
                        "function": {"name": tc.function.name, "arguments": tc.function.arguments},
                    }
                    for tc in tool_calls
                ],
            }
        )

        for tc in tool_calls:
            name = tc.function.name
            try:
                args = json.loads(tc.function.arguments or "{}")
            except json.JSONDecodeError:
                args = {}

            try:
                result = await _execute_tool_call(
                    name=name, args=args, tenant=tenant, db=db, store=store
                )
            except Exception as exc:
                logger.exception("Tool %s failed for tenant=%s", name, tenant.slug)
                result = {"error": str(exc), "data": ""}

            actions.append({"tool": name, "args": args, "result": result})
            if name == "search_knowledge_base" and result.get("hits"):
                sources.extend(result["hits"])

            thread.append(
                {
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "name": name,
                    "content": json.dumps(result.get("data", result), ensure_ascii=False)[:8000],
                }
            )

    # Hit the loop limit without a final answer.
    return ChatTurnResult(
        answer="I wasn't able to generate a final answer. Please try rephrasing.",
        actions=actions,
        sources=sources,
    )
