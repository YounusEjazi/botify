"""Admin endpoints. Bearer-token guarded; consumed by the dashboard."""
from __future__ import annotations

import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Annotated, Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..actions.salesforce import test_salesforce_credentials
from ..auth import require_admin
from ..chat import llm as chat_llm
from ..crypto import encrypt_dict
from ..db import get_db
from ..models import Conversation, Document, Integration, Message, Tenant
from ..rag.indexer import fetch_url, index_document
from ..rag.store import get_vector_store
from ..schemas import (
    AnalyticsOut,
    DailyCount,
    DocumentFromUrl,
    DocumentOut,
    EmbeddingConfigOut,
    EmbeddingConfigUpdate,
    IntegrationCreate,
    IntegrationOut,
    IntegrationTestResult,
    LLMConfigOut,
    LLMConfigUpdate,
    LLMTestResult,
    RetrievalConfigOut,
    RetrievalConfigUpdate,
    SalesforceTestRequest,
    TenantCreate,
    TenantOut,
    TenantUpdate,
    TopQuestion,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/admin",
    tags=["admin"],
    dependencies=[Depends(require_admin)],
)


# ─── Tenants ───────────────────────────────────────────────────────────────


@router.get("/tenants", response_model=list[TenantOut])
def list_tenants(db: Annotated[Session, Depends(get_db)]) -> list[Tenant]:
    return list(db.scalars(select(Tenant).order_by(Tenant.created_at.desc())).all())


@router.post("/tenants", response_model=TenantOut, status_code=status.HTTP_201_CREATED)
def create_tenant(payload: TenantCreate, db: Annotated[Session, Depends(get_db)]) -> Tenant:
    if db.scalar(select(Tenant).where(Tenant.slug == payload.slug)):
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Slug already taken")

    tenant = Tenant(
        slug=payload.slug,
        name=payload.name,
        allowed_origins=payload.allowed_origins,
        branding=payload.branding,
        languages=payload.languages,
        default_language=payload.default_language,
        llm_config=payload.llm_config,
        system_prompts=payload.system_prompts,
        ui_strings=payload.ui_strings,
        guardrails_enabled=payload.guardrails_enabled,
        captcha_required=payload.captcha_required,
        widget_api_key=secrets.token_urlsafe(24),
    )
    db.add(tenant)
    db.commit()
    db.refresh(tenant)
    return tenant


@router.get("/tenants/{slug}", response_model=TenantOut)
def get_tenant(slug: str, db: Annotated[Session, Depends(get_db)]) -> Tenant:
    tenant = db.scalar(select(Tenant).where(Tenant.slug == slug))
    if not tenant:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    return tenant


@router.patch("/tenants/{slug}", response_model=TenantOut)
def update_tenant(
    slug: str,
    payload: TenantUpdate,
    db: Annotated[Session, Depends(get_db)],
) -> Tenant:
    tenant = db.scalar(select(Tenant).where(Tenant.slug == slug))
    if not tenant:
        raise HTTPException(status.HTTP_404_NOT_FOUND)

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(tenant, field, value)
    db.commit()
    db.refresh(tenant)
    return tenant


@router.delete("/tenants/{slug}", status_code=status.HTTP_204_NO_CONTENT)
def delete_tenant(slug: str, db: Annotated[Session, Depends(get_db)]) -> None:
    tenant = db.scalar(select(Tenant).where(Tenant.slug == slug))
    if not tenant:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    db.delete(tenant)
    db.commit()


# ─── LLM connector ─────────────────────────────────────────────────────────


@router.get("/tenants/{slug}/llm", response_model=LLMConfigOut)
def get_llm_config(slug: str, db: Annotated[Session, Depends(get_db)]) -> LLMConfigOut:
    tenant = _get_tenant_or_404(slug, db)
    cfg = tenant.llm_config or {}
    return LLMConfigOut(
        provider=cfg.get("provider", ""),
        model=cfg.get("model", ""),
        temperature=float(cfg.get("temperature", 0.0)),
        api_base=cfg.get("api_base", ""),
        has_api_key=bool(tenant.llm_api_key_encrypted),
    )


@router.put("/tenants/{slug}/llm", response_model=LLMConfigOut)
def update_llm_config(
    slug: str,
    payload: LLMConfigUpdate,
    db: Annotated[Session, Depends(get_db)],
) -> LLMConfigOut:
    tenant = _get_tenant_or_404(slug, db)

    new_cfg: dict[str, Any] = {
        "provider": payload.provider,
        "model": payload.model,
        "temperature": payload.temperature,
    }
    if payload.api_base:
        new_cfg["api_base"] = payload.api_base
    tenant.llm_config = new_cfg

    if payload.api_key:
        tenant.llm_api_key_encrypted = encrypt_dict({"api_key": payload.api_key})

    db.commit()
    db.refresh(tenant)
    return LLMConfigOut(
        provider=new_cfg.get("provider", ""),
        model=new_cfg.get("model", ""),
        temperature=float(new_cfg.get("temperature", 0.0)),
        api_base=new_cfg.get("api_base", ""),
        has_api_key=bool(tenant.llm_api_key_encrypted),
    )


@router.delete("/tenants/{slug}/llm/key", status_code=status.HTTP_204_NO_CONTENT)
def delete_llm_api_key(slug: str, db: Annotated[Session, Depends(get_db)]) -> None:
    tenant = _get_tenant_or_404(slug, db)
    tenant.llm_api_key_encrypted = None
    db.commit()


@router.post("/tenants/{slug}/llm/test", response_model=LLMTestResult)
async def test_llm_config(
    slug: str, db: Annotated[Session, Depends(get_db)]
) -> LLMTestResult:
    """Fire a one-token completion against the tenant's current LLM config."""
    tenant = _get_tenant_or_404(slug, db)
    cfg = chat_llm.effective_llm_config(tenant)
    if not cfg.get("model"):
        return LLMTestResult(ok=False, detail="No model configured.")
    try:
        await chat_llm.chat_completion(
            messages=[{"role": "user", "content": "ping"}],
            tenant_llm_config={**cfg, "max_tokens": 1},
        )
        return LLMTestResult(ok=True, model=cfg.get("model", ""), detail="OK")
    except Exception as exc:
        return LLMTestResult(ok=False, model=cfg.get("model", ""), detail=str(exc)[:500])


# ─── Embedding connector ───────────────────────────────────────────────────


@router.get("/tenants/{slug}/embedding", response_model=EmbeddingConfigOut)
def get_embedding_config(slug: str, db: Annotated[Session, Depends(get_db)]) -> EmbeddingConfigOut:
    tenant = _get_tenant_or_404(slug, db)
    cfg = tenant.embedding_config or {}
    return EmbeddingConfigOut(
        provider=cfg.get("provider", ""),
        model=cfg.get("model", ""),
        api_base=cfg.get("api_base", ""),
        has_api_key=bool(tenant.embedding_api_key_encrypted),
    )


@router.put("/tenants/{slug}/embedding", response_model=EmbeddingConfigOut)
def update_embedding_config(
    slug: str,
    payload: EmbeddingConfigUpdate,
    db: Annotated[Session, Depends(get_db)],
) -> EmbeddingConfigOut:
    tenant = _get_tenant_or_404(slug, db)

    new_cfg: dict[str, Any] = {
        "provider": payload.provider,
        "model": payload.model,
    }
    if payload.api_base:
        new_cfg["api_base"] = payload.api_base
    tenant.embedding_config = new_cfg

    if payload.api_key:
        tenant.embedding_api_key_encrypted = encrypt_dict({"api_key": payload.api_key})

    db.commit()
    db.refresh(tenant)
    return EmbeddingConfigOut(
        provider=new_cfg.get("provider", ""),
        model=new_cfg.get("model", ""),
        api_base=new_cfg.get("api_base", ""),
        has_api_key=bool(tenant.embedding_api_key_encrypted),
    )


@router.delete("/tenants/{slug}/embedding/key", status_code=status.HTTP_204_NO_CONTENT)
def delete_embedding_api_key(slug: str, db: Annotated[Session, Depends(get_db)]) -> None:
    tenant = _get_tenant_or_404(slug, db)
    tenant.embedding_api_key_encrypted = None
    db.commit()


@router.post("/tenants/{slug}/embedding/test", response_model=LLMTestResult)
async def test_embedding_config(
    slug: str, db: Annotated[Session, Depends(get_db)]
) -> LLMTestResult:
    """Embed a one-token string to verify provider + key + model work."""
    tenant = _get_tenant_or_404(slug, db)
    cfg = chat_llm.effective_embedding_config(tenant)
    if not cfg.get("model"):
        return LLMTestResult(ok=False, detail="No embedding model configured.")
    try:
        await chat_llm.embed(["ping"], tenant_llm_config=cfg)
        return LLMTestResult(ok=True, model=cfg.get("model", ""), detail="OK")
    except Exception as exc:
        return LLMTestResult(ok=False, model=cfg.get("model", ""), detail=str(exc)[:500])


# ─── Retrieval (hybrid search + reranker) ──────────────────────────────────


def _retrieval_out(tenant: Tenant) -> RetrievalConfigOut:
    cfg = tenant.retrieval_config or {}
    rerank = cfg.get("rerank") or {}
    return RetrievalConfigOut(
        mode=cfg.get("mode", "hybrid"),
        candidate_k=int(cfg.get("candidate_k", 30)),
        rerank_enabled=bool(rerank.get("enabled", False)),
        rerank_provider=rerank.get("provider", ""),
        rerank_model=rerank.get("model", ""),
        rerank_top_k=int(rerank.get("top_k", 5)),
        has_rerank_api_key=bool(tenant.rerank_api_key_encrypted),
    )


@router.get("/tenants/{slug}/retrieval", response_model=RetrievalConfigOut)
def get_retrieval_config(slug: str, db: Annotated[Session, Depends(get_db)]) -> RetrievalConfigOut:
    return _retrieval_out(_get_tenant_or_404(slug, db))


@router.put("/tenants/{slug}/retrieval", response_model=RetrievalConfigOut)
def update_retrieval_config(
    slug: str,
    payload: RetrievalConfigUpdate,
    db: Annotated[Session, Depends(get_db)],
) -> RetrievalConfigOut:
    tenant = _get_tenant_or_404(slug, db)
    tenant.retrieval_config = {
        "mode": payload.mode,
        "candidate_k": payload.candidate_k,
        "rerank": {
            "enabled": payload.rerank_enabled,
            "provider": payload.rerank_provider,
            "model": payload.rerank_model,
            "top_k": payload.rerank_top_k,
        },
    }
    if payload.rerank_api_key:
        tenant.rerank_api_key_encrypted = encrypt_dict({"api_key": payload.rerank_api_key})
    db.commit()
    db.refresh(tenant)
    return _retrieval_out(tenant)


@router.delete("/tenants/{slug}/retrieval/key", status_code=status.HTTP_204_NO_CONTENT)
def delete_rerank_api_key(slug: str, db: Annotated[Session, Depends(get_db)]) -> None:
    tenant = _get_tenant_or_404(slug, db)
    tenant.rerank_api_key_encrypted = None
    db.commit()


# ─── Integrations ──────────────────────────────────────────────────────────


@router.get("/tenants/{slug}/integrations", response_model=list[IntegrationOut])
def list_integrations(slug: str, db: Annotated[Session, Depends(get_db)]):
    tenant = _get_tenant_or_404(slug, db)
    return [
        IntegrationOut(
            id=i.id,
            kind=i.kind,
            name=i.name,
            enabled=i.enabled,
            config=i.config,
            has_secret=bool(i.encrypted_secret),
        )
        for i in tenant.integrations
    ]


@router.post(
    "/tenants/{slug}/integrations",
    response_model=IntegrationOut,
    status_code=status.HTTP_201_CREATED,
)
def create_integration(
    slug: str,
    payload: IntegrationCreate,
    db: Annotated[Session, Depends(get_db)],
):
    tenant = _get_tenant_or_404(slug, db)
    from ..actions.registry import REGISTRY

    if payload.kind not in REGISTRY:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown integration kind. Available: {list(REGISTRY)}",
        )

    existing = db.scalar(
        select(Integration).where(
            Integration.tenant_id == tenant.id, Integration.kind == payload.kind
        )
    )
    if existing:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail=f"Tenant already has a {payload.kind} integration. Update it instead.",
        )

    integration = Integration(
        tenant_id=tenant.id,
        kind=payload.kind,
        name=payload.name,
        config=payload.config,
        enabled=payload.enabled,
        encrypted_secret=encrypt_dict(payload.secret) if payload.secret else None,
    )
    db.add(integration)
    db.commit()
    db.refresh(integration)
    return IntegrationOut(
        id=integration.id,
        kind=integration.kind,
        name=integration.name,
        enabled=integration.enabled,
        config=integration.config,
        has_secret=bool(integration.encrypted_secret),
    )


@router.patch("/integrations/{integration_id}", response_model=IntegrationOut)
def update_integration(
    integration_id: str,
    payload: IntegrationCreate,
    db: Annotated[Session, Depends(get_db)],
):
    integration = db.get(Integration, integration_id)
    if not integration:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    integration.name = payload.name
    integration.config = payload.config
    integration.enabled = payload.enabled
    if payload.secret:
        integration.encrypted_secret = encrypt_dict(payload.secret)
    db.commit()
    db.refresh(integration)
    return IntegrationOut(
        id=integration.id,
        kind=integration.kind,
        name=integration.name,
        enabled=integration.enabled,
        config=integration.config,
        has_secret=bool(integration.encrypted_secret),
    )


@router.delete("/integrations/{integration_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_integration(integration_id: str, db: Annotated[Session, Depends(get_db)]) -> None:
    integration = db.get(Integration, integration_id)
    if not integration:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    db.delete(integration)
    db.commit()


@router.post("/integrations/test/salesforce", response_model=IntegrationTestResult)
async def test_salesforce(payload: SalesforceTestRequest) -> IntegrationTestResult:
    """Dry-run a Salesforce OAuth token request. No Case is created."""
    ok, detail = await test_salesforce_credentials(
        instance_url=payload.instance_url,
        token_url=payload.token_url or None,
        client_id=payload.client_id,
        client_secret=payload.client_secret,
    )
    return IntegrationTestResult(ok=ok, detail=detail)


# ─── Knowledge base ────────────────────────────────────────────────────────


@router.get("/tenants/{slug}/documents", response_model=list[DocumentOut])
def list_documents(slug: str, db: Annotated[Session, Depends(get_db)]):
    tenant = _get_tenant_or_404(slug, db)
    return list(db.scalars(select(Document).where(Document.tenant_id == tenant.id)).all())


@router.post("/tenants/{slug}/documents/upload", response_model=DocumentOut)
async def upload_document(
    slug: str,
    file: Annotated[UploadFile, File()],
    title: Annotated[str | None, Form()] = None,
    db: Annotated[Session, Depends(get_db)] = None,
):
    """Upload a file (PDF, text, markdown, HTML) and index it for the tenant.

    For production: enqueue this to a worker. Inline here for simplicity.
    """
    tenant = _get_tenant_or_404(slug, db)
    raw = await file.read()
    doc = Document(
        tenant_id=tenant.id,
        title=title or file.filename or "Untitled",
        mime_type=file.content_type,
        status="pending",
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    try:
        await index_document(document=doc, raw_content=raw, tenant=tenant, db=db)
    except Exception:
        pass  # status is already set to "failed" in the indexer
    return doc


@router.post("/tenants/{slug}/documents/from-url", response_model=DocumentOut)
async def add_document_from_url(
    slug: str,
    payload: DocumentFromUrl,
    db: Annotated[Session, Depends(get_db)],
):
    tenant = _get_tenant_or_404(slug, db)
    content, content_type = await fetch_url(payload.url)
    doc = Document(
        tenant_id=tenant.id,
        title=payload.title or payload.url,
        source_url=payload.url,
        mime_type=content_type,
        status="pending",
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    try:
        await index_document(document=doc, raw_content=content, tenant=tenant, db=db)
    except Exception:
        pass
    return doc


@router.delete("/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(document_id: str, db: Annotated[Session, Depends(get_db)]) -> None:
    doc = db.get(Document, document_id)
    if not doc:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    await get_vector_store().delete_document(
        tenant_id=doc.tenant_id, document_id=doc.id, db=db
    )
    db.delete(doc)
    db.commit()


@router.delete("/tenants/{slug}/documents", status_code=status.HTTP_204_NO_CONTENT)
async def delete_all_documents(slug: str, db: Annotated[Session, Depends(get_db)]) -> None:
    """Wipe the entire knowledge base for a tenant (every document + chunks)."""
    tenant = _get_tenant_or_404(slug, db)
    docs = list(db.scalars(select(Document).where(Document.tenant_id == tenant.id)).all())
    store = get_vector_store()
    for doc in docs:
        await store.delete_document(tenant_id=tenant.id, document_id=doc.id, db=db)
        db.delete(doc)
    db.commit()


# ─── Analytics ────────────────────────────────────────────────────────────


@router.get("/tenants/{slug}/analytics", response_model=AnalyticsOut)
def get_analytics(slug: str, db: Annotated[Session, Depends(get_db)]) -> AnalyticsOut:
    tenant = _get_tenant_or_404(slug, db)
    tid = tenant.id
    now = datetime.now(timezone.utc)
    cutoff_7d  = now - timedelta(days=7)
    cutoff_30d = now - timedelta(days=30)

    # ── Conversation counts ────────────────────────────────────────────
    all_convos = db.scalars(select(Conversation).where(Conversation.tenant_id == tid)).all()
    total_conversations = len(all_convos)
    convos_7d  = sum(1 for c in all_convos if c.created_at and c.created_at.replace(tzinfo=timezone.utc) >= cutoff_7d)
    convos_30d = sum(1 for c in all_convos if c.created_at and c.created_at.replace(tzinfo=timezone.utc) >= cutoff_30d)

    # ── Messages ───────────────────────────────────────────────────────
    all_msgs = db.scalars(
        select(Message).join(Conversation).where(Conversation.tenant_id == tid)
    ).all()
    total_messages = len(all_msgs)
    avg_msgs = round(total_messages / total_conversations, 2) if total_conversations else 0.0

    # ── Ratings ────────────────────────────────────────────────────────
    rating_positive = sum(1 for c in all_convos if c.rating == 1)
    rating_negative = sum(1 for c in all_convos if c.rating == -1)
    rating_neutral  = sum(1 for c in all_convos if c.rating == 0)
    unrated         = sum(1 for c in all_convos if c.rating is None)

    # ── Daily volume (last 30 days) ────────────────────────────────────
    daily: dict[str, int] = {}
    for c in all_convos:
        if c.created_at and c.created_at.replace(tzinfo=timezone.utc) >= cutoff_30d:
            day = c.created_at.strftime("%Y-%m-%d")
            daily[day] = daily.get(day, 0) + 1
    # Fill in zeroes for days with no conversations.
    daily_counts: list[DailyCount] = []
    for i in range(30):
        day = (now - timedelta(days=29 - i)).strftime("%Y-%m-%d")
        daily_counts.append(DailyCount(date=day, count=daily.get(day, 0)))

    # ── Top questions (most frequent user messages) ────────────────────
    freq: dict[str, int] = {}
    for m in all_msgs:
        if m.role == "user":
            key = m.content.strip()[:120]
            freq[key] = freq.get(key, 0) + 1
    top_questions = [
        TopQuestion(question=q, count=n)
        for q, n in sorted(freq.items(), key=lambda x: x[1], reverse=True)[:10]
    ]

    # ── Language breakdown ─────────────────────────────────────────────
    lang_breakdown: dict[str, int] = {}
    for c in all_convos:
        lang = c.language or "unknown"
        lang_breakdown[lang] = lang_breakdown.get(lang, 0) + 1

    return AnalyticsOut(
        total_conversations=total_conversations,
        total_messages=total_messages,
        avg_messages_per_conversation=avg_msgs,
        conversations_last_7d=convos_7d,
        conversations_last_30d=convos_30d,
        rating_positive=rating_positive,
        rating_negative=rating_negative,
        rating_neutral=rating_neutral,
        unrated=unrated,
        daily_conversations=daily_counts,
        top_questions=top_questions,
        language_breakdown=lang_breakdown,
    )


# ─── Conversations ─────────────────────────────────────────────────────────


@router.get("/tenants/{slug}/conversations")
def list_conversations(
    slug: str, db: Annotated[Session, Depends(get_db)], limit: int = 50
):
    tenant = _get_tenant_or_404(slug, db)
    rows = db.scalars(
        select(Conversation)
        .where(Conversation.tenant_id == tenant.id)
        .order_by(Conversation.created_at.desc())
        .limit(limit)
    ).all()
    return [
        {
            "id": c.id,
            "session_id": c.session_id,
            "language": c.language,
            "origin": c.origin,
            "created_at": c.created_at,
            "message_count": len(c.messages),
            "first_user_message": next(
                (m.content for m in c.messages if m.role == "user"), ""
            )[:200],
        }
        for c in rows
    ]


@router.delete("/tenants/{slug}/conversations", status_code=status.HTTP_204_NO_CONTENT)
def delete_all_conversations(slug: str, db: Annotated[Session, Depends(get_db)]) -> None:
    """Wipe every conversation (and message) for a tenant."""
    tenant = _get_tenant_or_404(slug, db)
    for convo in list(
        db.scalars(select(Conversation).where(Conversation.tenant_id == tenant.id)).all()
    ):
        db.delete(convo)
    db.commit()


@router.get("/conversations/{conversation_id}")
def get_conversation(conversation_id: str, db: Annotated[Session, Depends(get_db)]):
    convo = db.get(Conversation, conversation_id)
    if not convo:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    return {
        "id": convo.id,
        "session_id": convo.session_id,
        "language": convo.language,
        "origin": convo.origin,
        "created_at": convo.created_at,
        "messages": [
            {
                "role": m.role,
                "content": m.content,
                "tool_data": m.tool_data,
                "created_at": m.created_at,
            }
            for m in convo.messages
        ],
    }


# ─── Helpers ───────────────────────────────────────────────────────────────


def _get_tenant_or_404(slug: str, db: Session) -> Tenant:
    tenant = db.scalar(select(Tenant).where(Tenant.slug == slug))
    if not tenant:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Tenant not found")
    return tenant
