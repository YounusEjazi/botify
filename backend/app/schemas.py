"""Pydantic schemas for the API.

We keep them centralized here so the same types are reused across routes.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, EmailStr, Field


# ─── Widget-facing schemas ────────────────────────────────────────────────


class WidgetMessage(BaseModel):
    role: str = Field(pattern="^(user|assistant)$")
    content: str


class ChatRequest(BaseModel):
    messages: list[WidgetMessage]
    language: str | None = None
    session_id: str | None = None


class SourceHit(BaseModel):
    id: str | None = None
    title: str = ""
    content: str
    source_url: str | None = None
    score: float | None = None


class ChatAction(BaseModel):
    tool: str
    args: dict[str, Any] | None = None
    result: dict[str, Any]


class ChatResponse(BaseModel):
    answer: str
    actions: list[ChatAction] = []
    sources: list[SourceHit] = []
    blocked: bool = False
    block_reason: str | None = None


class PublicTenantConfig(BaseModel):
    """What the widget needs at bootstrap. Never contains secrets."""

    slug: str
    name: str
    branding: dict[str, Any]
    languages: list[str]
    default_language: str
    ui_strings: dict[str, dict[str, str]]
    captcha_required: bool


class TicketRequest(BaseModel):
    subject: str
    description: str
    name: str = ""
    email: str = ""
    chat_history: str = ""


# ─── Admin-facing schemas ─────────────────────────────────────────────────


class TenantCreate(BaseModel):
    slug: str = Field(min_length=2, max_length=64, pattern="^[a-z0-9-]+$")
    name: str
    allowed_origins: list[str] = []
    branding: dict[str, Any] = {}
    languages: list[str] = ["en"]
    default_language: str = "en"
    llm_config: dict[str, Any] = {}
    system_prompts: dict[str, str] = {}
    ui_strings: dict[str, dict[str, str]] = {}
    guardrails_enabled: bool = True
    captcha_required: bool = False


class TenantUpdate(BaseModel):
    name: str | None = None
    allowed_origins: list[str] | None = None
    branding: dict[str, Any] | None = None
    languages: list[str] | None = None
    default_language: str | None = None
    llm_config: dict[str, Any] | None = None
    system_prompts: dict[str, str] | None = None
    ui_strings: dict[str, dict[str, str]] | None = None
    guardrails_enabled: bool | None = None
    captcha_required: bool | None = None


class TenantOut(BaseModel):
    id: str
    slug: str
    name: str
    allowed_origins: list[str]
    branding: dict[str, Any]
    languages: list[str]
    default_language: str
    llm_config: dict[str, Any]
    system_prompts: dict[str, str]
    ui_strings: dict[str, dict[str, str]]
    guardrails_enabled: bool
    captcha_required: bool
    widget_api_key: str
    created_at: datetime

    class Config:
        from_attributes = True


class LLMConfigOut(BaseModel):
    provider: str = ""
    model: str = ""
    temperature: float = 0.0
    api_base: str = ""
    has_api_key: bool = False


class LLMConfigUpdate(BaseModel):
    provider: str = ""
    model: str
    temperature: float = 0.0
    api_base: str = ""
    # If None or empty, the existing key is preserved. Send a new value to rotate.
    api_key: str | None = None


class LLMTestResult(BaseModel):
    ok: bool
    detail: str = ""
    model: str = ""


class EmbeddingConfigOut(BaseModel):
    provider: str = ""
    model: str = ""
    api_base: str = ""
    has_api_key: bool = False


class EmbeddingConfigUpdate(BaseModel):
    provider: str = ""
    model: str
    api_base: str = ""
    api_key: str | None = None


class IntegrationCreate(BaseModel):
    kind: str
    name: str
    config: dict[str, Any] = {}
    secret: dict[str, Any] = {}
    enabled: bool = True


class SalesforceTestRequest(BaseModel):
    instance_url: str
    token_url: str = ""
    client_id: str
    client_secret: str


class IntegrationTestResult(BaseModel):
    ok: bool
    detail: str = ""


class IntegrationOut(BaseModel):
    id: str
    kind: str
    name: str
    enabled: bool
    config: dict[str, Any]
    has_secret: bool

    class Config:
        from_attributes = True


class DocumentOut(BaseModel):
    id: str
    title: str
    source_url: str | None
    mime_type: str | None
    status: str
    chunk_count: int
    error_message: str | None
    created_at: datetime

    class Config:
        from_attributes = True


class DocumentFromUrl(BaseModel):
    url: str
    title: str | None = None
