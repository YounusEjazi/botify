"""Local vector store: embeddings as float32 bytes in the Chunks table,
cosine similarity computed in-process with numpy.

Retrieval pipeline:
  1. Vector cosine over all tenant chunks.
  2. (Hybrid mode only) BM25 over the same chunks.
  3. Reciprocal Rank Fusion to combine the two rankings.
  4. (Optional) Cross-encoder rerank of the top candidates.

Good for: dev, small-to-medium tenants (~tens of thousands of chunks).
Not for: very large tenants — at that point swap to pgvector + FTS.
"""
from __future__ import annotations

from typing import Any

import numpy as np
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from ..chat.llm import effective_embedding_config, embed
from ..models import Chunk, Tenant
from .bm25 import bm25_scores
from .rerank import effective_rerank_config, rerank as rerank_documents

# RRF constant — 60 is the value from the original Cormack/Clarke/Buettcher paper.
# Higher = flatter weighting of top ranks; lower = sharper.
RRF_K = 60


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


def _rrf_fuse(rankings: list[list[int]], n: int) -> list[tuple[int, float]]:
    """Reciprocal Rank Fusion over multiple full rankings.

    Each ranking is a list of row indices in descending relevance order. Returns
    (row_index, fused_score) for all candidate rows, sorted by score desc.
    """
    fused: dict[int, float] = {}
    for ranking in rankings:
        for rank, row_idx in enumerate(ranking):
            fused[row_idx] = fused.get(row_idx, 0.0) + 1.0 / (RRF_K + rank + 1)
    ordered = sorted(fused.items(), key=lambda kv: kv[1], reverse=True)
    return ordered[:n]


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
        retrieval_cfg = getattr(tenant, "retrieval_config", None) or {}
        mode = retrieval_cfg.get("mode", "hybrid")
        candidate_k = int(retrieval_cfg.get("candidate_k", 30))
        rerank_cfg = effective_rerank_config(tenant)
        rerank_enabled = bool(rerank_cfg.get("enabled"))

        # CRITICAL: every read is tenant-scoped. This is the isolation boundary.
        rows = db.scalars(select(Chunk).where(Chunk.tenant_id == tenant_id)).all()
        if not rows:
            return []

        # ── Vector scores ──────────────────────────────────────────────
        query_vec_list = await embed(
            [query], tenant_llm_config=effective_embedding_config(tenant)
        )
        query_vec = np.asarray(query_vec_list[0], dtype=np.float32)
        matrix = np.stack([_from_bytes(r.embedding) for r in rows])
        vec_scores = _cosine(query_vec, matrix)
        vec_ranking = np.argsort(-vec_scores).tolist()

        # ── Candidate selection (vector-only vs hybrid) ────────────────
        if mode == "hybrid":
            lex_scores = bm25_scores(query, [r.content for r in rows])
            lex_ranking = np.argsort(-np.asarray(lex_scores)).tolist()
            # If BM25 produced no signal (query had no tokens), fall back to vector.
            if max(lex_scores) > 0:
                fused = _rrf_fuse([vec_ranking, lex_ranking], n=max(candidate_k, k))
            else:
                fused = [(i, float(vec_scores[i])) for i in vec_ranking[:max(candidate_k, k)]]
        else:
            fused = [(i, float(vec_scores[i])) for i in vec_ranking[:max(candidate_k, k)]]

        # ── Optional rerank ────────────────────────────────────────────
        if rerank_enabled and fused:
            top_n = int(rerank_cfg.get("top_k", k))
            candidate_idxs = [i for i, _ in fused]
            candidate_texts = [rows[i].content for i in candidate_idxs]
            reranked = await rerank_documents(
                query=query,
                documents=candidate_texts,
                top_n=top_n,
                rerank_config=rerank_cfg,
            )
            picks = [(candidate_idxs[local_i], score) for local_i, score in reranked]
        else:
            picks = fused[: max(1, min(k, len(rows)))]

        return [
            {
                "id": rows[i].id,
                "document_id": rows[i].document_id,
                "title": rows[i].title or "",
                "content": rows[i].content,
                "source_url": rows[i].source_url,
                "score": float(score),
            }
            for i, score in picks
        ]

    async def delete_document(self, *, tenant_id: str, document_id: str, db: Session) -> None:
        db.execute(
            delete(Chunk).where(Chunk.document_id == document_id, Chunk.tenant_id == tenant_id)
        )
        db.commit()
