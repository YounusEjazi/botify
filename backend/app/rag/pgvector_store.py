"""pgvector-backed VectorStore.

Requires PostgreSQL with the pgvector extension. Enabled automatically when
DATABASE_URL starts with 'postgresql'. Falls back to LocalVectorStore on SQLite.

The embedding_vec column is added to chunks by _ensure_columns() in db.py.
"""
from __future__ import annotations
import logging
import struct

from sqlalchemy import text

from ..chat.llm import effective_embedding_config, embed
from ..models import Chunk, Tenant
from .bm25 import bm25_scores
from .rerank import effective_rerank_config, rerank

logger = logging.getLogger(__name__)
RRF_K = 60


class PostgresVectorStore:
    # --- upsert ---
    async def upsert(self, *, tenant_id, document_id, chunks, embeddings, db):
        # Delete existing chunks for this document first
        db.query(Chunk).filter(
            Chunk.tenant_id == tenant_id,
            Chunk.document_id == document_id,
        ).delete()

        for chunk_dict, emb in zip(chunks, embeddings):
            # Convert embedding list to bytes (float32) for legacy column
            emb_bytes = struct.pack(f"{len(emb)}f", *emb)
            # Convert to pgvector format string "[0.1, 0.2, ...]"
            emb_vec_str = "[" + ",".join(str(v) for v in emb) + "]"

            c = Chunk(
                tenant_id=tenant_id,
                document_id=document_id,
                ordinal=chunk_dict.get("ordinal", 0),
                content=chunk_dict["content"],
                title=chunk_dict.get("title"),
                source_url=chunk_dict.get("source_url"),
                embedding=emb_bytes,
            )
            db.add(c)
            db.flush()  # get the ID
            # Set the vector column via raw SQL
            db.execute(
                text("UPDATE chunks SET embedding_vec = :vec WHERE id = :id"),
                {"vec": emb_vec_str, "id": c.id},
            )
        db.commit()

    # --- search ---
    async def search(self, *, tenant_id, query, k, db, tenant):
        rc = tenant.retrieval_config or {}
        mode = rc.get("mode", "hybrid")
        candidate_k = rc.get("candidate_k", 30)
        rerank_cfg = rc.get("rerank", {})
        rerank_enabled = rerank_cfg.get("enabled", False)

        final_k = rerank_cfg.get("top_k", 5) if rerank_enabled else k

        # Get query embedding
        emb_cfg = effective_embedding_config(tenant)
        query_embs = await embed([query], tenant_llm_config=emb_cfg)
        query_emb = query_embs[0]
        emb_vec_str = "[" + ",".join(str(v) for v in query_emb) + "]"

        # Vector search using cosine distance (<=>)
        vec_rows = db.execute(
            text("""
                SELECT id, content, title, source_url,
                       1 - (embedding_vec <=> :vec::vector) AS score
                FROM chunks
                WHERE tenant_id = :tid AND embedding_vec IS NOT NULL
                ORDER BY embedding_vec <=> :vec::vector
                LIMIT :lim
            """),
            {"vec": emb_vec_str, "tid": tenant_id, "lim": candidate_k},
        ).fetchall()

        if not vec_rows:
            return []

        # Build list of dicts for results
        results = [
            {
                "id": r.id,
                "content": r.content,
                "title": r.title or "",
                "source_url": r.source_url,
                "score": float(r.score),
            }
            for r in vec_rows
        ]

        if mode == "hybrid":
            # BM25 on the candidate set
            contents = [r["content"] for r in results]
            lex_scores = bm25_scores(query, contents)
            max_lex = max(lex_scores) if lex_scores else 0.0

            if max_lex > 0:
                # Build rankings: vector ranking + BM25 ranking
                vec_ranking = list(range(len(results)))  # already sorted by vec
                lex_ranking = sorted(range(len(results)), key=lambda i: lex_scores[i], reverse=True)

                # RRF fusion
                rrf_scores = [0.0] * len(results)
                for rank, idx in enumerate(vec_ranking):
                    rrf_scores[idx] += 1.0 / (RRF_K + rank + 1)
                for rank, idx in enumerate(lex_ranking):
                    rrf_scores[idx] += 1.0 / (RRF_K + rank + 1)

                results = [results[i] for i in sorted(range(len(results)), key=lambda i: rrf_scores[i], reverse=True)]

        if rerank_enabled:
            full_cfg = effective_rerank_config(tenant)
            if full_cfg.get("api_key"):
                reranked = await rerank(
                    query=query,
                    documents=[r["content"] for r in results],
                    top_n=final_k,
                    rerank_config=full_cfg,
                )
                results = [results[orig_idx] for orig_idx, _ in reranked]

        return results[:k]

    # --- delete_document ---
    async def delete_document(self, *, tenant_id, document_id, db):
        db.query(Chunk).filter(
            Chunk.tenant_id == tenant_id,
            Chunk.document_id == document_id,
        ).delete()
        db.commit()
