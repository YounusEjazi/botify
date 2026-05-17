"""Minimal BM25 lexical scorer.

Self-contained, no extra dependencies. Good enough for the hybrid-search use
case where we already have the candidate set in memory (everything filtered
by tenant_id). For very large corpora you'd want a real inverted index, but
at that point the whole vector store should move to pgvector + Postgres FTS.
"""
from __future__ import annotations

import math
import re
from collections import Counter

_TOKEN_RE = re.compile(r"\w+", re.UNICODE)


def tokenize(text: str) -> list[str]:
    return _TOKEN_RE.findall((text or "").lower())


def bm25_scores(
    query: str,
    documents: list[str],
    *,
    k1: float = 1.5,
    b: float = 0.75,
) -> list[float]:
    """Return one BM25 score per document for the given query.

    Returns zeros if the query has no tokens or the corpus is empty.
    """
    if not documents:
        return []
    q_terms = tokenize(query)
    if not q_terms:
        return [0.0] * len(documents)

    tokenized = [tokenize(d) for d in documents]
    doc_lens = [len(t) for t in tokenized]
    avgdl = (sum(doc_lens) / len(doc_lens)) or 1.0
    n_docs = len(documents)

    # Document frequency for each unique query term.
    df: dict[str, int] = {}
    q_unique = set(q_terms)
    for toks in tokenized:
        seen = q_unique.intersection(toks)
        for term in seen:
            df[term] = df.get(term, 0) + 1

    # IDF with the BM25+ smoothing variant (always non-negative).
    idf = {
        term: math.log(1 + (n_docs - df_t + 0.5) / (df_t + 0.5))
        for term, df_t in df.items()
    }

    scores: list[float] = []
    for toks, dl in zip(tokenized, doc_lens):
        tf = Counter(toks)
        score = 0.0
        for term in q_terms:
            f = tf.get(term, 0)
            if not f:
                continue
            denom = f + k1 * (1 - b + b * dl / avgdl)
            score += idf.get(term, 0.0) * (f * (k1 + 1)) / denom
        scores.append(score)
    return scores
