"""Public widget endpoints.

Security model: tenant resolution + Origin allowlist enforcement. The widget
API key in the script tag is a tenant identifier, not a secret — origin is the
real boundary.

Endpoints:
  GET  /config/{slug}    → widget bootstrap config (no secrets)
  POST /chat             → chat turn (tool loop runs server-side)
  POST /ticket           → submit a confirmed ticket form
"""
from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import enforce_origin, resolve_tenant
from ..chat.orchestrator import run_chat_turn
from ..crypto import decrypt_dict
from ..db import get_db
from ..models import Conversation, Integration, Message, Tenant
from ..schemas import (
    ChatRequest,
    ChatResponse,
    PublicTenantConfig,
    RateRequest,
    SourceHit,
    TicketRequest,
)

logger = logging.getLogger(__name__)
router = APIRouter(tags=["public"])


@router.get("/config/{slug}", response_model=PublicTenantConfig)
def get_config(
    slug: str,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
) -> PublicTenantConfig:
    """Widget bootstrap. Browser calls this on load."""
    tenant = db.scalar(select(Tenant).where(Tenant.slug == slug))
    if not tenant:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Tenant not found")
    enforce_origin(request, tenant)

    return PublicTenantConfig(
        slug=tenant.slug,
        name=tenant.name,
        branding=tenant.branding,
        languages=tenant.languages,
        default_language=tenant.default_language,
        ui_strings=tenant.ui_strings,
        captcha_required=tenant.captcha_required,
    )


@router.post("/chat", response_model=ChatResponse)
async def chat(
    payload: ChatRequest,
    request: Request,
    tenant: Annotated[Tenant, Depends(resolve_tenant)],
    db: Annotated[Session, Depends(get_db)],
) -> ChatResponse:
    enforce_origin(request, tenant)

    messages_dicts = [m.model_dump() for m in payload.messages]
    result = await run_chat_turn(
        tenant=tenant,
        messages=messages_dicts,
        language=payload.language,
        db=db,
    )

    # Persist conversation. For high-volume tenants, push this to a queue.
    if not result.blocked and result.answer:
        _persist_conversation(
            tenant=tenant,
            request=request,
            payload=payload,
            user_message=messages_dicts[-1] if messages_dicts else None,
            assistant_message=result.answer,
            actions=result.actions,
            db=db,
        )

    return ChatResponse(
        answer=result.answer,
        actions=[
            {"tool": a["tool"], "args": a.get("args"), "result": a.get("result", {})}
            for a in result.actions
        ],
        sources=[SourceHit(**s) for s in result.sources],
        blocked=result.blocked,
        block_reason=result.block_reason,
    )


@router.post("/ticket")
async def submit_ticket(
    payload: TicketRequest,
    request: Request,
    tenant: Annotated[Tenant, Depends(resolve_tenant)],
    db: Annotated[Session, Depends(get_db)],
):
    """User confirmed the ticket form — actually submit it.

    Routes to whichever ticketing integration the tenant has enabled
    (Salesforce, webhook, email — first match wins).
    """
    enforce_origin(request, tenant)

    integration = next(
        (
            i
            for i in tenant.integrations
            if i.enabled and i.kind in {"salesforce", "webhook", "email", "zendesk"}
        ),
        None,
    )
    if not integration:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="No ticketing integration configured for this tenant.",
        )

    secret = decrypt_dict(integration.encrypted_secret)
    description = f"{payload.description}\n\n---\nFrom: {payload.name} <{payload.email}>"
    if payload.chat_history:
        description += f"\n\n---\nChat history:\n{payload.chat_history[:8000]}"

    try:
        if integration.kind == "salesforce":
            from ..actions.salesforce import submit_salesforce_case

            result = await submit_salesforce_case(
                tenant=tenant,
                public_config=integration.config,
                secret=secret,
                fields={"subject": payload.subject, "name": payload.name, "email": payload.email},
                description=description,
            )
        elif integration.kind == "webhook":
            from ..actions.webhook import WebhookAction

            result = await WebhookAction().execute(
                args={
                    "subject": payload.subject,
                    "description": description,
                    "name": payload.name,
                    "email": payload.email,
                    "chat_history": payload.chat_history,
                },
                public_config=integration.config,
                secret=secret,
                tenant=tenant,
            )
        elif integration.kind == "zendesk":
            from ..actions.zendesk import submit_zendesk_ticket

            result = await submit_zendesk_ticket(
                tenant=tenant,
                public_config=integration.config,
                secret=secret,
                fields={"subject": payload.subject, "name": payload.name, "email": payload.email},
                description=description,
            )
        else:  # email
            from ..actions.email import EmailAction

            result = await EmailAction().execute(
                args={
                    "subject": payload.subject,
                    "summary": description,
                    "user_name": payload.name,
                    "user_email": payload.email,
                },
                public_config=integration.config,
                secret=secret,
                tenant=tenant,
            )

        return {"status": "success", **result}
    except Exception as exc:
        logger.exception("Ticket submission failed for tenant=%s", tenant.slug)
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail=str(exc))


@router.post("/rate", status_code=204)
async def rate_conversation(
    payload: RateRequest,
    request: Request,
    tenant: Annotated[Tenant, Depends(resolve_tenant)],
    db: Annotated[Session, Depends(get_db)],
) -> None:
    """Widget calls this when the user thumbs-up or thumbs-down a response."""
    enforce_origin(request, tenant)
    convo = db.scalar(
        select(Conversation).where(
            Conversation.tenant_id == tenant.id,
            Conversation.session_id == payload.session_id,
        )
    )
    if not convo:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Conversation not found")
    convo.rating = payload.rating
    db.commit()


def _persist_conversation(
    *,
    tenant: Tenant,
    request: Request,
    payload: ChatRequest,
    user_message: dict | None,
    assistant_message: str,
    actions: list[dict],
    db: Session,
) -> None:
    """Append turn to the conversation log."""
    convo: Conversation | None = None
    if payload.session_id:
        convo = db.scalar(
            select(Conversation).where(
                Conversation.tenant_id == tenant.id,
                Conversation.session_id == payload.session_id,
            )
        )
    if not convo:
        convo = Conversation(
            tenant_id=tenant.id,
            session_id=payload.session_id,
            origin=request.headers.get("origin"),
            ip_address=request.headers.get("x-forwarded-for") or (request.client.host if request.client else None),
            language=payload.language,
        )
        db.add(convo)
        db.flush()

    if user_message:
        db.add(
            Message(
                conversation_id=convo.id,
                role="user",
                content=user_message.get("content", ""),
            )
        )
    db.add(
        Message(
            conversation_id=convo.id,
            role="assistant",
            content=assistant_message,
            tool_data={"actions": actions} if actions else None,
        )
    )
    db.commit()
