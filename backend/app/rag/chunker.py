"""Token-aware text chunking with overlap.

Embedding models work best on chunks of 200-800 tokens. We default to 500 with
75-token overlap, which keeps semantic context across boundaries.
"""
from __future__ import annotations

import re

import tiktoken

_ENC = tiktoken.get_encoding("cl100k_base")  # works for OpenAI + most providers


def count_tokens(text: str) -> int:
    return len(_ENC.encode(text or ""))


def chunk_text(
    text: str,
    *,
    chunk_tokens: int = 500,
    overlap_tokens: int = 75,
) -> list[str]:
    """Split text into overlapping token windows, prefer breaking on paragraphs."""
    if not text or not text.strip():
        return []

    # Normalize whitespace and break into paragraphs first — produces cleaner
    # chunks than naive token slicing.
    paragraphs = [p.strip() for p in re.split(r"\n{2,}", text) if p.strip()]

    chunks: list[str] = []
    buf: list[str] = []
    buf_tokens = 0

    for para in paragraphs:
        para_tokens = count_tokens(para)

        if para_tokens > chunk_tokens:
            # Paragraph is too big on its own — token-slice it.
            if buf:
                chunks.append("\n\n".join(buf))
                buf, buf_tokens = [], 0
            ids = _ENC.encode(para)
            step = chunk_tokens - overlap_tokens
            for i in range(0, len(ids), step):
                window = ids[i : i + chunk_tokens]
                if not window:
                    break
                chunks.append(_ENC.decode(window))
            continue

        if buf_tokens + para_tokens > chunk_tokens and buf:
            chunks.append("\n\n".join(buf))
            # Carry over a tail of the last chunk as overlap.
            tail = _ENC.decode(_ENC.encode(buf[-1])[-overlap_tokens:])
            buf, buf_tokens = ([tail] if tail else []), count_tokens(tail)

        buf.append(para)
        buf_tokens += para_tokens

    if buf:
        chunks.append("\n\n".join(buf))

    return chunks
