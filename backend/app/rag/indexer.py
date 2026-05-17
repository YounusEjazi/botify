"""End-to-end document indexing.

Pipeline:
  raw bytes / URL → extract text → chunk → embed → store

For production scale: move the indexing call into a background worker (Celery,
Azure Queue Trigger, or RQ). The dashboard endpoint should return immediately
with status="pending" and let the worker flip it to "ready".
"""
from __future__ import annotations

import logging
from io import BytesIO

import httpx
from bs4 import BeautifulSoup
from pypdf import PdfReader
from sqlalchemy.orm import Session

from ..models import Document, Tenant
from ..chat.llm import effective_embedding_config, embed
from .chunker import chunk_text
from .store import get_vector_store

logger = logging.getLogger(__name__)


async def extract_text(content: bytes, mime_type: str | None, source_url: str | None) -> str:
    """Pull plain text out of whatever was uploaded."""
    if mime_type == "application/pdf" or (source_url or "").lower().endswith(".pdf"):
        reader = PdfReader(BytesIO(content))
        return "\n\n".join((page.extract_text() or "") for page in reader.pages)

    if mime_type and mime_type.startswith("text/html"):
        soup = BeautifulSoup(content, "html.parser")
        for tag in soup(["script", "style", "nav", "footer"]):
            tag.decompose()
        return soup.get_text(separator="\n\n", strip=True)

    # Plain text, markdown, anything else readable as UTF-8.
    try:
        return content.decode("utf-8", errors="ignore")
    except Exception:
        return ""


async def fetch_url(url: str) -> tuple[bytes, str]:
    async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        return resp.content, resp.headers.get("content-type", "").split(";")[0].strip()


async def index_document(
    *,
    document: Document,
    raw_content: bytes,
    tenant: Tenant,
    db: Session,
) -> None:
    """Index a single document. Updates the Document row's status as it goes."""
    document.status = "indexing"
    db.commit()

    try:
        text = await extract_text(raw_content, document.mime_type, document.source_url)
        if not text.strip():
            raise ValueError("No extractable text in document")

        chunk_strs = chunk_text(text)
        if not chunk_strs:
            raise ValueError("Chunking produced no chunks")

        embeddings = await embed(chunk_strs, tenant_llm_config=effective_embedding_config(tenant))

        chunks = [
            {
                "content": c,
                "title": document.title,
                "source_url": document.source_url,
            }
            for c in chunk_strs
        ]
        await get_vector_store().upsert(
            tenant_id=tenant.id,
            document_id=document.id,
            chunks=chunks,
            embeddings=embeddings,
            db=db,
        )

        document.chunk_count = len(chunks)
        document.status = "ready"
        document.error_message = None
        db.commit()
        logger.info("Indexed %s (%d chunks) for tenant=%s", document.title, len(chunks), tenant.slug)

    except Exception as exc:
        logger.exception("Indexing failed for document=%s", document.id)
        document.status = "failed"
        document.error_message = str(exc)[:1000]
        db.commit()
        raise
