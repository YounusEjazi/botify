"""Local vector store: embeddings as float32 bytes in the Chunks table,
cosine similarity computed in-process with numpy.

Good for: dev, small-to-medium tenants (~tens of thousands of chunks).
Not for: very large tenants — at that point swap to pgvector or Azure Search.
"""
from __future__ import annotations

from typing import Any

import numpy as np
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from ..chat.llm import effective_embedding_config, embed
from ..models import Chunk, Tenant


def _to_bytes(vector: list[float]) -> bytes:
    return np.asarray(vector, dtype=np.float32).tobytes()


def _from_bytes(blob: bytes) -> np.ndarray:
    return np.frombuffer(blob, dtype=np.float32)


def _cosine(query: np.ndarray, matrix: np.ndarray) -> np.ndarray:
    """Cosine similarity between one query vector and N rows of a matrix."""
    q_norm = np.linalg.norm(query) or 1.0
    m_norms = np.linalg.norm(matrix, axis=1)
    m_norms[m_norms == 0] = 1.0
    return (matrix @ query) / (m_norms * q_norm)


class LocalVectorStore:
    async def upsert(
        self,
        *,
        tenant_id: str,
        document_id: str,
        chunks: list[dict[str, Any]],
        embeddings: list[list[float]],
        db: Session,
    ) -> None:
        if len(chunks) != len(embeddings):
            raise ValueError("chunks and embeddings must be the same length")

        # Replace any existing chunks for this document.
        db.execute(delete(Chunk).where(Chunk.document_id == document_id))

        for ordinal, (chunk, vec) in enumerate(zip(chunks, embeddings)):
            db.add(
                Chunk(
                    tenant_id=tenant_id,
                    document_id=document_id,
                    ordinal=ordinal,
                    content=chunk["content"],
                    title=chunk.get("title"),
                    source_url=chunk.get("source_url"),
                    embedding=_to_bytes(vec),
                )
            )
        db.commit()

    async def search(
        self,
        *,
        tenant_id: str,
        query: str,
        k: int,
        db: Session,
        tenant: Tenant,
    ) -> list[dict[str, Any]]:
        query_vec_list = await embed([query], tenant_llm_config=effective_embedding_config(tenant))
        query_vec = np.asarray(query_vec_list[0], dtype=np.float32)

        # CRITICAL: every read is tenant-scoped. This is the isolation boundary.
        rows = db.scalars(select(Chunk).where(Chunk.tenant_id == tenant_id)).all()
        if not rows:
            return []

        matrix = np.stack([_from_bytes(r.embedding) for r in rows])
        scores = _cosine(query_vec, matrix)

        # Take top k by score.
        k = max(1, min(k, len(rows)))
        top_idx = np.argsort(-scores)[:k]
        return [
            {
                "id": rows[i].id,
                "document_id": rows[i].document_id,
                "title": rows[i].title or "",
                "content": rows[i].content,
                "source_url": rows[i].source_url,
                "score": float(scores[i]),
            }
            for i in top_idx
        ]

    async def delete_document(self, *, tenant_id: str, document_id: str, db: Session) -> None:
        db.execute(
            delete(Chunk).where(Chunk.document_id == document_id, Chunk.tenant_id == tenant_id)
        )
        db.commit()
