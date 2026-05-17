# Backend

FastAPI multi-tenant chatbot backend.

## Setup

```bash
cd backend

# 1) Install (use uv or pip)
uv pip install -e .       # or: pip install -e .

# 2) Generate an encryption key + set up .env
cp .env.example .env
python -c "from cryptography.fernet import Fernet; print('ENCRYPTION_KEY=' + Fernet.generate_key().decode())" >> .env

# 3) Put your OPENAI_API_KEY (or other LLM provider key) in .env

# 4) Seed demo tenants
python seed.py

# 5) Run
uvicorn app.main:app --reload --port 8000
```

Health check: `curl http://localhost:8000/health`

OpenAPI docs: `http://localhost:8000/docs`

## Key concepts

- **`Tenant`** — root entity. Everything is scoped by `tenant_id`.
- **`Integration`** — per-tenant plugin (Salesforce, webhook, email).
- **`Document` / `Chunk`** — knowledge base with embedded chunks.
- **`Conversation` / `Message`** — chat log for analytics.

## Authentication

- **Widget calls** (`/chat`, `/config`, `/ticket`): browser sends `X-Tenant-Slug` header; backend enforces the tenant's `allowed_origins` list. The widget API key in the script tag is a tenant identifier, not a secret — origin is the security boundary.
- **Admin calls** (`/admin/*`): `Authorization: Bearer <ADMIN_API_KEY>` from your `.env`. The dashboard sits behind your own auth and proxies to these endpoints.

## Swapping the vector store

The default uses SQLite + numpy. For production:

1. Implement the `VectorStore` protocol in `app/rag/store.py` against pgvector or Azure AI Search.
2. Call `set_vector_store(your_impl)` at startup in `app/main.py`.

Pattern matches Onyx's `VectorStore` abstraction with multiple backends.

## Swapping the LLM

LiteLLM routes by model string. Each tenant's `llm_config.model` can be any LiteLLM-supported model (`gpt-4o-mini`, `anthropic/claude-sonnet-4-5`, `azure/<deployment>`, `gemini/gemini-2.5-pro`, etc.). API keys come from env vars per LiteLLM's conventions.

## Production checklist

- [ ] Replace SQLite with Postgres in `DATABASE_URL`
- [ ] Use Alembic for migrations instead of `init_db()` autocreate
- [ ] Move document indexing into a background worker (Celery / RQ / Azure Queue)
- [ ] Plug in a real vector store (pgvector, Azure Search)
- [ ] Lock down CORS — set `allow_origin_regex` to your dashboard origin only
- [ ] Add rate limiting (e.g. `slowapi`)
- [ ] Rotate `ENCRYPTION_KEY` on a schedule (requires re-encrypting integration secrets)
- [ ] Wire structured logging + tracing
