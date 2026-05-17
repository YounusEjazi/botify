<div align="center">

# Bot-ify

**Turn any business into a bot.**

A multi-tenant, embed-anywhere chatbot platform.
One line of HTML on your customer's site → a chatbot powered by their docs, their LLM keys, their Salesforce.

</div>

---

## What it is

You run one backend, one dashboard, one widget bundle. Every customer ("tenant") gets their own:

- **System prompt** (per language)
- **LLM provider + API key** — OpenAI, Anthropic, DeepSeek, Gemini, Groq, Azure, or any OpenAI-compatible endpoint
- **Embedding provider + API key** — separate from the chat LLM (e.g. DeepSeek chat + OpenAI embeddings)
- **Knowledge base** — upload PDF/HTML/Markdown, or crawl URLs. Indexed into per-tenant vector chunks.
- **Branding** — colors, logo, display name, copy, allowed origins
- **Integrations** — Salesforce, Webhook, Email handoff
- **Conversation log** — viewable from the dashboard

No code changes per customer. Everything is rows in a database, editable from the dashboard.

```
┌────────────────────┐         ┌────────────────────┐
│  Customer's site   │ ──────▶ │  CDN: widget.v1.js │
│  (one <script>)    │         └────────┬───────────┘
└────────────────────┘                  │
                                        ▼
                              ┌─────────────────────┐
                              │  Backend (FastAPI)  │ ◀──── Dashboard (Next.js)
                              │  • Tenant config    │       admin / config
                              │  • Chat orchestrator│
                              │  • RAG index        │
                              │  • Pluggable actions│
                              └─────────────────────┘
                                        │
                                        ▼
                              ┌─────────────────────┐
                              │  Postgres           │
                              │  • tenants + chunks │
                              │  • encrypted secrets│
                              └─────────────────────┘
```

---

## Repo layout

```
bot-ify/
├── backend/                 FastAPI + SQLAlchemy + LiteLLM
│   ├── app/
│   │   ├── main.py          App entry; CORS; routes
│   │   ├── models.py        Tenant, Integration, Document, Chunk, Conversation, Message
│   │   ├── schemas.py       Pydantic request/response models
│   │   ├── crypto.py        Fernet encryption for API keys + secrets
│   │   ├── db.py            Engine + idempotent column migrations
│   │   ├── auth.py          Admin Bearer-token guard
│   │   ├── routes/
│   │   │   ├── admin.py     Dashboard-facing CRUD + test endpoints
│   │   │   └── public.py    Widget-facing chat + tenant config
│   │   ├── chat/
│   │   │   ├── llm.py       LiteLLM wrapper, effective_*_config() helpers
│   │   │   ├── orchestrator.py  Prompt → moderation → tool loop → answer
│   │   │   └── moderation.py    LLM-based guardrail classifier
│   │   ├── rag/
│   │   │   ├── indexer.py       Extract → chunk → embed → store
│   │   │   ├── chunker.py
│   │   │   ├── store.py         VectorStore protocol
│   │   │   └── local_store.py   Postgres+numpy implementation
│   │   └── actions/
│   │       ├── registry.py      Dispatch table for integrations
│   │       ├── salesforce.py    OAuth client_credentials → Composite API
│   │       ├── webhook.py       Generic outbound POST
│   │       └── email.py         SMTP handoff
│   ├── seed.py              Creates a "demo" tenant
│   └── pyproject.toml
├── dashboard/               Next.js 15 (App Router) admin UI
│   ├── app/
│   │   ├── page.tsx                 Tenants list
│   │   ├── tenants/new/             Create tenant
│   │   └── tenants/[slug]/
│   │       ├── page.tsx             Overview
│   │       ├── llm/                 Chat LLM + Embedding provider
│   │       ├── prompt/              System prompt editor
│   │       ├── branding/            Colors / logo / display name
│   │       ├── knowledge/           Document uploader + index status
│   │       ├── integrations/        Salesforce / Webhook / Email
│   │       ├── conversations/       Chat history viewer
│   │       └── danger/              Tenant-scoped destructive actions
│   ├── components/
│   │   ├── Sidebar.tsx
│   │   ├── Logo.tsx                 Bot-ify mark (SVG)
│   │   └── ui.tsx                   Field, Notice, Empty
│   └── lib/api.ts                   Typed API client
├── widget/                  Vue Custom Element → single IIFE bundle
│   ├── src/
│   │   ├── main.ce.js              Auto-mount; reads data-* from script tag
│   │   ├── ChatbotWidget.ce.vue    UI (bubble, panel, messages)
│   │   └── api.js                  Public chat endpoint client
│   ├── playground/index.html       Local dev: demo + custom tenant switcher
│   └── vite.config.js              Builds widget.v1.js
└── docker-compose.yml       backend + dashboard + Postgres
```

---

## Quick start (Docker — recommended)

```bash
git clone https://github.com/YounusEjazi/botify.git
cd botify

# 1. Create .env in the root
cp .env.example .env

# 2. Generate an encryption key and edit .env
python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
# Paste output into .env as ENCRYPTION_KEY=...
# Set ADMIN_API_KEY=<anything> and OPENAI_API_KEY=<your key> (or skip — configure per tenant)

# 3. Boot it
docker compose up --build
# backend   → http://localhost:8000   (OpenAPI: /docs)
# dashboard → http://localhost:3000
# postgres  → :5432

# 4. Seed one demo tenant (in another terminal)
docker compose exec backend python seed.py

# 5. Open the dashboard and click the demo tenant.
#    Configure its LLM, upload a doc, then try the widget playground:
cd widget && npm install && npm run dev
# http://localhost:4173/playground/
```

---

## Quick start (local, no Docker)

```bash
# ─── Backend ────────────────────────────────────────────
cd backend
pip install -e .
cp ../.env.example .env
python -c "from cryptography.fernet import Fernet; print('ENCRYPTION_KEY=' + Fernet.generate_key().decode())" >> .env
# Fill in DATABASE_URL (sqlite:///bot.db works for dev), ADMIN_API_KEY, OPENAI_API_KEY
python seed.py
uvicorn app.main:app --reload --port 8000

# ─── Dashboard (new terminal) ───────────────────────────
cd dashboard
npm install
cp .env.example .env.local
# Ensure ADMIN_API_KEY matches the backend
npm run dev   # http://localhost:3000

# ─── Widget (new terminal) ──────────────────────────────
cd widget
npm install
npm run dev   # http://localhost:4173/playground/
```

---

## The embed snippet

One line on the customer's site:

```html
<script
    src="https://cdn.yours.com/widget.v1.js"
    data-tenant="acme"
    data-api-base="https://api.yours.com"
    data-position="bottom-right"
    async
></script>
```

Everything else — prompts, branding, knowledge, LLM provider, integrations — is configured in the dashboard per tenant.

---

## Per-tenant configuration (what lives where)

Everything that would otherwise be a hardcoded global is a tenant row:

| Concern | Where it lives | Editable from |
|---|---|---|
| System prompts (per language) | `Tenant.system_prompts[lang]` | Dashboard → System prompt |
| Chat LLM + API key | `Tenant.llm_config` + `llm_api_key_encrypted` | Dashboard → LLM |
| Embedding model + API key | `Tenant.embedding_config` + `embedding_api_key_encrypted` | Dashboard → LLM |
| Vector index | `chunks.tenant_id` filter | (write-only via dashboard upload) |
| Salesforce config | `Integration` row (`kind="salesforce"`) | Dashboard → Integrations |
| CORS allowlist | `Tenant.allowed_origins[]` | Dashboard → Overview |
| i18n + branding | `Tenant.branding` + `Tenant.ui_strings` | Dashboard → Branding |
| Supported languages | `Tenant.languages[]` | Dashboard |
| Widget API key | `Tenant.widget_api_key` (auto-generated) | (read-only) |

API keys and integration secrets are encrypted at rest with Fernet (`backend/app/crypto.py`) and never returned by any API endpoint after they're saved.

---

## LLM providers

LiteLLM under the hood. Anything LiteLLM supports works as a tenant LLM. Built-in presets in the dashboard:

| Provider | Chat models | Embedding models |
|---|---|---|
| OpenAI | gpt-4o, gpt-4o-mini, gpt-4.1, o4-mini | text-embedding-3-small/large |
| Anthropic | claude-haiku-4-5, claude-sonnet-4-6, claude-opus-4-7 | — |
| DeepSeek | deepseek-chat, deepseek-reasoner | — |
| Google Gemini | gemini-2.5-flash, gemini-2.5-pro | text-embedding-004 |
| Groq | llama-3.3-70b, llama-3.1-8b | — |
| Voyage AI | — | voyage-3, voyage-3-lite, voyage-code-3 |
| Cohere | — | embed-english-v3.0, embed-multilingual-v3.0 |
| Custom | any OpenAI-compatible | any OpenAI-compatible |

DeepSeek/Anthropic don't offer embeddings — typical config is `{ chat: DeepSeek, embeddings: OpenAI }`. The dashboard's **Test connection** button does a one-token live call against each provider before you save.

---

## Vector store

`backend/app/rag/local_store.py` — embeddings stored as packed `float32` bytes in Postgres `chunks` table; cosine similarity computed in numpy. Brute-force scan with a `WHERE tenant_id = ?` filter as the isolation boundary. Comfortable up to tens of thousands of chunks per tenant.

Past that, swap to pgvector or Azure AI Search by implementing the `VectorStore` protocol in `rag/store.py` and updating `get_vector_store()`.

---

## Production checklist

- [ ] Lock down each tenant's `allowed_origins` (no `*`)
- [ ] Replace the idempotent `_ensure_columns()` startup with Alembic migrations
- [ ] Move the inline document indexing to a background worker (Celery / RQ / Azure Queue)
- [ ] Swap `LocalVectorStore` for pgvector once you cross ~50k chunks/tenant
- [ ] Tighten FastAPI CORS to your dashboard's origin only (`backend/app/main.py:33`)
- [ ] Put SSO / OAuth in front of the dashboard (currently Bearer-token only)
- [ ] Add rate limiting (slowapi or an upstream gateway)
- [ ] Move `ENCRYPTION_KEY` into a secrets manager (AWS Secrets Manager / Vault) — leaking it leaks every stored API key
- [ ] Structured logs + tracing
- [ ] Build the widget for production: `cd widget && npm run build`, serve `dist/widget.v1.js` from a CDN

---

## Extending

**New integration** (e.g. Zendesk):
1. Create `backend/app/actions/zendesk.py` implementing the `Action` protocol
2. Add to `REGISTRY` in `backend/app/actions/registry.py`
3. Add a card to `KINDS` in `dashboard/app/tenants/[slug]/integrations/IntegrationsManager.tsx`
4. (optional) Create a structured form like `SalesforceForm.tsx` for nicer UX

**New LLM provider preset**: add an entry to `PROVIDERS` in `dashboard/app/tenants/[slug]/llm/LLMConfigEditor.tsx` (or `EmbeddingConfigEditor.tsx`). The backend doesn't need changes — LiteLLM resolves providers from the `model` string prefix.

**New vector backend**: implement `VectorStore` in a new file, swap the factory in `rag/store.py`.

---

## Tech stack

- **Backend**: Python 3.12, FastAPI, SQLAlchemy 2, LiteLLM, httpx, pypdf, BeautifulSoup, numpy, cryptography (Fernet)
- **Dashboard**: Next.js 15 (App Router), React 19, TypeScript
- **Widget**: Vue 3 Custom Element, Vite (IIFE bundle)
- **DB**: Postgres 16 (works with SQLite for local dev)
- **Embeddings**: pluggable; default `text-embedding-3-small`
- **Orchestration**: Docker Compose for local; deploy each service independently in prod

---

## License

[MIT](LICENSE) © Younus Ejaz
