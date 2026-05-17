"""Database models.

The whole platform pivots on `Tenant`. Everything else is either owned by a
tenant or scoped to one. There is no global mutable state.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON, TypeDecorator

from .db import Base


def _uuid_str() -> str:
    return str(uuid.uuid4())


class _JSON(TypeDecorator):
    """JSON column that uses JSONB on Postgres, plain JSON elsewhere."""

    impl = JSON
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            return dialect.type_descriptor(JSONB())
        return dialect.type_descriptor(JSON())


# ─── Tenant ────────────────────────────────────────────────────────────────


class Tenant(Base):
    __tablename__ = "tenants"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid_str)
    slug: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)

    # CORS allowlist — replaces the old single FRONTEND_URL env var
    allowed_origins: Mapped[list[str]] = mapped_column(_JSON, default=list, nullable=False)

    # Branding — colors, logo, display name shown in the widget
    branding: Mapped[dict[str, Any]] = mapped_column(_JSON, default=dict, nullable=False)

    # Supported languages (ISO 639-1) and the default
    languages: Mapped[list[str]] = mapped_column(_JSON, default=lambda: ["en"], nullable=False)
    default_language: Mapped[str] = mapped_column(String(8), default="en", nullable=False)

    # LLM config: {"provider": "openai", "model": "gpt-4o-mini",
    #              "temperature": 0.0, "api_base": "..."}
    # Any LiteLLM-supported model string works.
    llm_config: Mapped[dict[str, Any]] = mapped_column(_JSON, default=dict, nullable=False)

    # Per-tenant LLM API key, encrypted at rest with Fernet (same as integrations).
    # Decrypted via chat.llm.effective_llm_config() and passed to LiteLLM per call.
    llm_api_key_encrypted: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)

    # Embedding (RAG) provider config. Separate from chat because providers like
    # DeepSeek/Anthropic don't offer embeddings — typical setup is chat=X, embed=OpenAI.
    # Shape: {"provider": "openai", "model": "text-embedding-3-small", "api_base": "..."}
    embedding_config: Mapped[dict[str, Any]] = mapped_column(_JSON, default=dict, nullable=False)
    embedding_api_key_encrypted: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)

    # System prompts per language: {"en": "...", "de": "..."}
    system_prompts: Mapped[dict[str, str]] = mapped_column(_JSON, default=dict, nullable=False)

    # i18n strings shown in the widget UI (greeting, placeholder, etc.)
    ui_strings: Mapped[dict[str, dict[str, str]]] = mapped_column(_JSON, default=dict, nullable=False)

    guardrails_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    captcha_required: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Widget API key — distinct from the admin key. Used by browsers, so treat
    # it as a tenant identifier, not a secret. Origin allowlist is the real
    # security boundary.
    widget_api_key: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    integrations: Mapped[list[Integration]] = relationship(
        back_populates="tenant", cascade="all, delete-orphan"
    )
    documents: Mapped[list[Document]] = relationship(
        back_populates="tenant", cascade="all, delete-orphan"
    )
    conversations: Mapped[list[Conversation]] = relationship(
        back_populates="tenant", cascade="all, delete-orphan"
    )


# ─── Integrations (pluggable actions) ──────────────────────────────────────


class Integration(Base):
    """Per-tenant configuration for an action plugin.

    `kind` matches a key in the action registry (e.g. "salesforce", "webhook").
    `config` is the public, non-secret part of the config (URLs, field maps).
    `encrypted_secret` holds credentials encrypted at rest with Fernet.
    """

    __tablename__ = "integrations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid_str)
    tenant_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("tenants.id", ondelete="CASCADE"), index=True
    )
    kind: Mapped[str] = mapped_column(String(64), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    config: Mapped[dict[str, Any]] = mapped_column(_JSON, default=dict, nullable=False)
    encrypted_secret: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    tenant: Mapped[Tenant] = relationship(back_populates="integrations")

    __table_args__ = (UniqueConstraint("tenant_id", "kind", name="uq_tenant_integration_kind"),)


# ─── Knowledge base ────────────────────────────────────────────────────────


class Document(Base):
    """Source document uploaded to a tenant's knowledge base."""

    __tablename__ = "documents"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid_str)
    tenant_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("tenants.id", ondelete="CASCADE"), index=True
    )
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    source_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    mime_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="pending", nullable=False)
    # "pending" → "indexing" → "ready" | "failed"
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    chunk_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    tenant: Mapped[Tenant] = relationship(back_populates="documents")
    chunks: Mapped[list[Chunk]] = relationship(back_populates="document", cascade="all, delete-orphan")


class Chunk(Base):
    """Indexed chunk with embedding.

    The embedding is stored as bytes (float32 packed) — fine for tens of
    thousands of chunks. For larger scale, plug in pgvector or Azure Search via
    the VectorStore interface in app/rag/store.py.
    """

    __tablename__ = "chunks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid_str)
    tenant_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("tenants.id", ondelete="CASCADE"), index=True
    )
    document_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("documents.id", ondelete="CASCADE"), index=True
    )
    ordinal: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    title: Mapped[str | None] = mapped_column(String(500), nullable=True)
    source_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    embedding: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    document: Mapped[Document] = relationship(back_populates="chunks")

    __table_args__ = (Index("ix_chunks_tenant_doc", "tenant_id", "document_id"),)


# ─── Conversation log ─────────────────────────────────────────────────────


class Conversation(Base):
    """A single chat session. Persisted for analytics + audit."""

    __tablename__ = "conversations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid_str)
    tenant_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("tenants.id", ondelete="CASCADE"), index=True
    )
    session_id: Mapped[str | None] = mapped_column(String(64), index=True, nullable=True)
    origin: Mapped[str | None] = mapped_column(String(500), nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(64), nullable=True)
    language: Mapped[str | None] = mapped_column(String(8), nullable=True)
    rating: Mapped[int | None] = mapped_column(Integer, nullable=True)  # -1, 0, +1
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    tenant: Mapped[Tenant] = relationship(back_populates="conversations")
    messages: Mapped[list[Message]] = relationship(
        back_populates="conversation", cascade="all, delete-orphan", order_by="Message.created_at"
    )


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid_str)
    conversation_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("conversations.id", ondelete="CASCADE"), index=True
    )
    role: Mapped[str] = mapped_column(String(16), nullable=False)  # user, assistant, tool, system
    content: Mapped[str] = mapped_column(Text, nullable=False)
    # Tool call metadata if any: {"tool": "create_ticket", "args": {...}, "result": {...}}
    tool_data: Mapped[dict[str, Any] | None] = mapped_column(_JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    conversation: Mapped[Conversation] = relationship(back_populates="messages")
