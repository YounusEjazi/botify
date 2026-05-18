"""Vector store abstraction.

The default implementation in `local_store.py` stores embeddings as bytes in
the Chunks table and does cosine similarity in-process with numpy. It works
out of the box for thousands of chunks per tenant.

To swap in Azure AI Search, pgvector, Vespa, etc., implement the same protocol
and swap the factory below. Onyx's pattern is identical — a `VectorStore` ABC
with multiple backends, selected by config.
"""
from __future__ import annotations

from typing import Any, Protocol

from sqlalchemy.orm import Session

from ..models import Tenant


class VectorStore(Protocol):
    async def upsert(
        self,
        *,
        tenant_id: str,
        document_id: str,
        chunks: list[dict[str, Any]],
        embeddings: list[list[float]],
        db: Session,
    ) -> None:
        """Insert or replace chunks for a document."""
        ...

    async def search(
        self,
        *,
        tenant_id: str,
        query: str,
        k: int,
        db: Session,
        tenant: Tenant,
    ) -> list[dict[str, Any]]:
        """Return top-k results for the query, scoped to tenant_id."""
        ...

    async def delete_document(self, *, tenant_id: str, document_id: str, db: Session) -> None:
        ...


_STORE: VectorStore | None = None


def get_vector_store() -> VectorStore:
    global _STORE
    if _STORE is None:
        from ..config import get_settings
        settings = get_settings()
        if settings.database_url.startswith("postgresql"):
            from .pgvector_store import PostgresVectorStore
            _STORE = PostgresVectorStore()
        else:
            from .local_store import LocalVectorStore
            _STORE = LocalVectorStore()
    return _STORE


def set_vector_store(store: VectorStore) -> None:
    """For tests, or when you swap in Azure Search / pgvector in production."""
    global _STORE
    _STORE = store
