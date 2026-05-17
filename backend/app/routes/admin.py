"""Admin endpoints. Bearer-token guarded; consumed by the dashboard."""
from __future__ import annotations

import logging
import secrets
from typing import Annotated, Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..actions.salesforce import test_salesforce_credentials
from ..auth import require_admin
from ..chat import llm as chat_llm
from ..crypto import encrypt_dict
from ..db import get_db
from ..models import Conversation, Document, Integration, Tenant
from ..rag.indexer import fetch_url, index_document
from ..rag.store import get_vector_store
from ..schemas import (
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
    SalesforceTestRequest,
    TenantCreate,
    TenantOut,
    TenantUpdate,
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
