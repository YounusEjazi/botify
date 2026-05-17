"""Cross-encoder reranker via LiteLLM.

A separate provider from chat + embeddings — typical setup is Cohere or Voyage
or Jina rerank, even if chat is OpenAI/Anthropic. Falls back to identity
ordering if rerank fails (we'd rather return slightly-worse results than fail
the whole query).
"""
from __future__ import annotations

import logging
from typing import Any

import litellm

from ..crypto import decrypt_dict

logger = logging.getLogger(__name__)


def effective_rerank_config(tenant) -> dict[str, Any]:
    """Merge tenant.retrieval_config.rerank with the decrypted rerank API key."""
    retrieval = getattr(tenant, "retrieval_config", None) or {}
    cfg: dict[str, Any] = {**(retrieval.get("rerank") or {})}
    cfg.pop("provider", None)

    blob = getattr(tenant, "rerank_api_key_encrypted", None)
    if blob:
        try:
            secret = decrypt_dict(blob)
            if api_key := secret.get("api_key"):
                cfg.setdefault("api_key", api_key)
        except Exception:
            logger.exception("Failed to decrypt rerank_api_key for tenant=%s", tenant.slug)
    return cfg


async def rerank(
    *,
    query: str,
    documents: list[str],
    top_n: int,
    rerank_config: dict[str, Any],
) -> list[tuple[int, float]]:
    """Rerank `documents` against `query`.

    Returns a list of (original_index, score) tuples in descending score order,
    truncated to `top_n`. On any failure, returns identity order so the caller
    keeps the fused ranking from hybrid search.
    """
    cfg = {**rerank_config}
    enabled = cfg.pop("enabled", False)
    model = cfg.pop("model", None)
    cfg.pop("top_k", None)  # caller-provided, not a litellm param

    if not enabled or not model or not documents:
        return [(i, 0.0) for i in range(min(top_n, len(documents)))]

    try:
        response = await litellm.arerank(
            model=model,
            query=query,
            documents=documents,
            top_n=min(top_n, len(documents)),
            **cfg,
        )
    except Exception:
        logger.exception("Reranker failed; falling back to fused order")
        return [(i, 0.0) for i in range(min(top_n, len(documents)))]

    # LiteLLM normalizes rerank responses to {results: [{index, relevance_score}, ...]}.
    results = response.get("results") if isinstance(response, dict) else getattr(response, "results", None)
    if not results:
        return [(i, 0.0) for i in range(min(top_n, len(documents)))]

    out: list[tuple[int, float]] = []
    for item in results:
        idx = item.get("index") if isinstance(item, dict) else getattr(item, "index", None)
        score = item.get("relevance_score") if isinstance(item, dict) else getattr(item, "relevance_score", 0.0)
        if idx is None:
            continue
        out.append((int(idx), float(score or 0.0)))
    return out[:top_n]
