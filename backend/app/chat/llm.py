"""LiteLLM wrapper: one interface for OpenAI, Anthropic, Azure OpenAI, Gemini, etc.

A tenant's llm_config decides which model to call. Models are referenced by
LiteLLM model strings (e.g. "gpt-4o-mini", "anthropic/claude-sonnet-4-5",
"azure/my-deployment-name", "azure_ai/mistral-large-latest"). See
https://docs.litellm.ai/docs/providers.

API keys come from environment — LiteLLM picks them up automatically. If you
want per-tenant API keys later, pass them through to `completion()` as
`api_key=...` from the tenant config.
Azure OpenAI tenant configs can also pass `api_base` and `api_version`.
"""
from __future__ import annotations

import logging
from typing import Any

import litellm

from ..config import get_settings
from ..crypto import decrypt_dict

logger = logging.getLogger(__name__)

# Surface real errors instead of LiteLLM's default of swallowing them silently.
litellm.drop_params = False


# Per-LiteLLM convention. Used to validate "provider/" model strings in the dashboard.
KNOWN_PROVIDERS = {
    "openai", "anthropic", "deepseek", "azure", "azure_ai",
    "gemini", "groq", "mistral", "ollama", "together_ai",
}


def effective_llm_config(tenant) -> dict[str, Any]:
    """Merge tenant.llm_config with the decrypted per-tenant API key.

    Returns a fresh dict (callers may pop from it). Strips internal-only keys
    (e.g. "provider", which is a UI label and not a LiteLLM param).
    """
    cfg: dict[str, Any] = {**(tenant.llm_config or {})}
    cfg.pop("provider", None)  # display label only

    blob = getattr(tenant, "llm_api_key_encrypted", None)
    if blob:
        try:
            secret = decrypt_dict(blob)
            if api_key := secret.get("api_key"):
                cfg.setdefault("api_key", api_key)
        except Exception:
            logger.exception("Failed to decrypt llm_api_key for tenant=%s", tenant.slug)
    return cfg


def effective_embedding_config(tenant) -> dict[str, Any]:
    """Merge tenant.embedding_config with the decrypted embedding API key.

    Mirrors effective_llm_config but for the RAG/embedding pipeline. Returns
    fields LiteLLM's aembedding() accepts: model, api_key, api_base, etc.
    """
    cfg: dict[str, Any] = {**(getattr(tenant, "embedding_config", None) or {})}
    cfg.pop("provider", None)

    blob = getattr(tenant, "embedding_api_key_encrypted", None)
    if blob:
        try:
            secret = decrypt_dict(blob)
            if api_key := secret.get("api_key"):
                cfg.setdefault("api_key", api_key)
        except Exception:
            logger.exception("Failed to decrypt embedding_api_key for tenant=%s", tenant.slug)
    return cfg


async def chat_completion(
    *,
    messages: list[dict[str, Any]],
    model: str | None = None,
    tools: list[dict[str, Any]] | None = None,
    temperature: float = 0.0,
    tenant_llm_config: dict[str, Any] | None = None,
) -> Any:
    """Single chat completion call.

    tenant_llm_config can override model, temperature, api_key, api_base, etc.
    """
    settings = get_settings()
    cfg = {**(tenant_llm_config or {})}

    params: dict[str, Any] = {
        "model": cfg.pop("model", model or settings.default_llm_model),
        "messages": messages,
        "temperature": cfg.pop("temperature", temperature),
    }
    if tools:
        params["tools"] = tools

    # Pass through anything else (api_key, api_base, api_version, max_tokens, …).
    params.update(cfg)

    return await litellm.acompletion(**params)


async def embed(
    texts: list[str],
    *,
    model: str | None = None,
    tenant_llm_config: dict[str, Any] | None = None,
) -> list[list[float]]:
    """Embed a batch of strings. Returns one vector per input.

    `tenant_llm_config` should be the merged dict from `effective_embedding_config(tenant)`.
    Anything beyond `model` (api_key, api_base, etc.) is forwarded to LiteLLM.
    """
    settings = get_settings()
    cfg = {**(tenant_llm_config or {})}

    embedding_model = (
        cfg.pop("model", None)
        or cfg.pop("embedding_model", None)  # back-compat: old llm_config field name
        or model
        or settings.default_embedding_model
    )

    # Drop fields that only apply to chat completions.
    for k in ("temperature", "max_tokens", "tools"):
        cfg.pop(k, None)

    response = await litellm.aembedding(model=embedding_model, input=texts, **cfg)
    return [item["embedding"] for item in response["data"]]
