"""Fetches pages from a connector and upserts them as documents."""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..crypto import decrypt_dict
from ..models import ConnectorSource, Document, Tenant
from ..rag.indexer import index_document
from .registry import CONNECTOR_REGISTRY

logger = logging.getLogger(__name__)


async def sync_connector(
    *, connector: ConnectorSource, tenant: Tenant, db: Session
) -> None:
    """Pull pages from the connector and index them as documents."""
    cls = CONNECTOR_REGISTRY.get(connector.kind)
    if not cls:
        raise ValueError(f"Unknown connector kind: {connector.kind}")

    connector.status = "syncing"
    db.commit()

    try:
        instance = cls()
        secret = decrypt_dict(connector.encrypted_secret)
        pages = await instance.fetch_pages(
            config=connector.config,
            secret=secret,
            since=connector.last_synced_at,
        )

        for page in pages:
            source_url = page.get("source_url")
            content = page.get("content", "")
            title = page.get("title", "Untitled")

            # Check if a document with this source_url already exists
            existing: Document | None = None
            if source_url:
                existing = db.scalar(
                    select(Document).where(
                        Document.tenant_id == tenant.id,
                        Document.source_url == source_url,
                    )
                )

            if existing:
                doc = existing
                doc.title = title
                doc.status = "pending"
                doc.error_message = None
            else:
                doc = Document(
                    tenant_id=tenant.id,
                    title=title,
                    source_url=source_url,
                    mime_type="text/plain",
                    status="pending",
                )
                db.add(doc)

            # Propagate the source-side modification timestamp if the model has the field.
            doc_updated_at = page.get("doc_updated_at")
            if doc_updated_at and hasattr(doc, "doc_updated_at"):
                doc.doc_updated_at = doc_updated_at

            db.flush()

            raw_content = content.encode("utf-8") if content.strip() else b""
            if raw_content:
                try:
                    await index_document(
                        document=doc,
                        raw_content=raw_content,
                        tenant=tenant,
                        db=db,
                    )
                except Exception:
                    # index_document already sets doc.status = "failed"
                    logger.exception(
                        "Failed to index page '%s' from connector %s", title, connector.id
                    )
            else:
                doc.status = "ready"
                doc.chunk_count = 0
                db.commit()

        connector.status = "ready"
        connector.last_synced_at = datetime.now(timezone.utc)
        connector.error_message = None
        db.commit()
        logger.info("Synced connector %s: %d pages", connector.id, len(pages))

    except Exception as exc:
        logger.exception("Connector sync failed: %s", connector.id)
        connector.status = "error"
        connector.error_message = str(exc)[:1000]
        db.commit()
        raise
