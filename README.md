<div align="center">

# Bot-ify

**Turn any business into a bot.**

A multi-tenant, embed-anywhere chatbot platform.
One line of HTML on your customer's site → a chatbot powered by their docs, their LLM keys, their Salesforce.

</div>

---

## What it is

You run one backend, one dashboard, one widget bundle. Customers sign up, log in, and each gets their own isolated workspace. Every tenant they create has its own:

- **System prompt** (per language)
- **LLM provider + API key** — OpenAI, Anthropic, DeepSeek, Gemini, Groq, Azure, or any OpenAI-compatible endpoint
- **Embedding provider + API key** — separate from the chat LLM (e.g. DeepSeek chat + OpenAI embeddings)
- **Knowledge base** — upload PDF / HTML / Markdown, crawl URLs, or sync from Notion / Google Drive
- **Retrieval pipeline** — hybrid BM25 + vector (pgvector when available, numpy fallback otherwise) with optional cross-encoder reranking
- **Branding** — colors, logo, display name, copy, allowed origins
- **Integrations** — Salesforce, Zendesk, Webhook, Email handoff, or any MCP server
- **Conversation log + analytics** — viewable from the dashboard

No code changes per customer. Everything is rows in a database, editable from the dashboard.

```
┌────────────────────┐         ┌────────────────────┐
│  Customer's site   │ ──────▶ │  CDN: widget.v1.js │
│  (one <script>)    │         └────────┬───────────┘
└────────────────────┘                  │
                                        ▼
                              ┌─────────────────────┐
                              │  Backend (FastAPI)  │ ◀──── Dashboard (Next.js)
                              │  • Users + auth     │       • signup / login
                              │  • Tenant config    │       • per-user tenants
                              │  • Chat orchestrator│       • marketing site
                              │  • RAG + connectors │       • docs / account
                              │  • Integrations     │
                              └─────────────────────┘
                                        │
                                        ▼
                              ┌─────────────────────┐
                              │  Postgres (+pgvector)│
                              │  • users + tenants  │
                              │  • encrypted secrets│
                              │  • chunks (HNSW)    │
                              └─────────────────────┘
```

---

## Repo layout

```
bot-ify/
├── backend/                 FastAPI + SQLAlchemy + LiteLLM
│   ├── app/
│   │   ├── main.py          App entry; CORS; routes
│   │   ├── models.py        User, Tenant, Integration, ConnectorSource, Document, Chunk, Conversation, Message
│   │   ├── schemas.py       Pydantic request/response models
│   │   ├── crypto.py        Fernet encryption for API keys + secrets
│   │   ├── db.py            Engine + idempotent column migrations
│   │   ├── auth.py          Admin Bearer-token guard for dashboard proxy
│   │   ├── routes/
│   │   │   ├── auth.py      /api/users — register, login, profile, change-password, delete-account
│   │   │   ├── admin.py     Dashboard-facing CRUD (filtered by X-User-Id)
│   │   │   └── public.py    Widget-facing chat + tenant config
│   │   ├── chat/
│   │   │   ├── llm.py       LiteLLM wrapper, effective_*_config() helpers
│   │   │   ├── orchestrator.py  Prompt → moderation → tool loop → answer
│   │   │   └── moderation.py    LLM-based guardrail classifier
│   │   ├── rag/
│   │   │   ├── indexer.py       Extract → chunk → embed → store
│   │   │   ├── chunker.py
│   │   │   ├── store.py         VectorStore factory (pgvector → numpy fallback)
│   │   │   ├── pgvector_store.py  Postgres + pgvector, hybrid + rerank
│   │   │   ├── local_store.py     Postgres + numpy fallback
│   │   │   └── reranker.py        Cohere / Voyage / Jina cross-encoders
│   │   ├── connectors/      Pull-based source syncs
│   │   │   ├── registry.py
│   │   │   ├── notion.py        Notion databases + pages
│   │   │   ├── gdrive.py        Google Drive folders + files
│   │   │   └── sync.py          Incremental pull → index → mark synced
│   │   └── actions/         Tool / integration handlers
│   │       ├── registry.py
│   │       ├── salesforce.py    OAuth client_credentials → Composite API
│   │       ├── zendesk.py       Basic-auth ticket creation
│   │       ├── webhook.py       Generic HMAC-signed POST
│   │       ├── email.py         SMTP handoff
│   │       └── mcp_client.py    Model Context Protocol (JSON-RPC 2.0)
│   ├── seed.py              Creates a "demo" tenant
│   └── pyproject.toml
├── dashboard/               Next.js 15 (App Router) admin UI + marketing
│   ├── app/
│   │   ├── page.tsx                 Marketing homepage (session-aware nav)
│   │   ├── docs/                    Static documentation pages
│   │   ├── login/                   Sign in / Create account (server actions)
│   │   ├── account/                 Profile, change password, delete account
│   │   ├── tenants/                 Tenant list (per-user, with Home / Docs / Account nav)
│   │   ├── tenants/new/             Create tenant
│   │   ├── tenants/[slug]/
│   │   │   ├── page.tsx             Overview
│   │   │   ├── llm/                 Chat LLM + Embedding provider
│   │   │   ├── prompt/              System prompt editor
│   │   │   ├── branding/            Colors / logo / display name
│   │   │   ├── knowledge/           Document uploader + index status
│   │   │   ├── connectors/          Notion / Google Drive auto-sync
│   │   │   ├── retrieval/           Hybrid search + reranker config
│   │   │   ├── integrations/        Salesforce / Zendesk / Webhook / Email / MCP
│   │   │   ├── conversations/       Chat history viewer
│   │   │   ├── analytics/           Volume, ratings, top questions
│   │   │   └── danger/              Tenant-scoped destructive actions
│   │   └── api/
│   │       └── proxy/[...path]/     Server proxy: injects admin Bearer + X-User-Id
│   ├── components/
│   │   ├── Sidebar.tsx              Tenant nav + Home / Profile / Sign out
│   │   ├── LogoutButton.tsx
│   │   ├── Logo.tsx                 Bot-ify mark (SVG)
│   │   └── ui.tsx                   Field, Notice, Empty
│   ├── lib/
│   │   ├── session.ts               HMAC-signed cookie (Edge-compatible)
│   │   └── api.ts                   Typed API client
│   └── middleware.ts                Protects /tenants/* and /account/*
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

# 2. Generate secrets and edit .env
python3 -c "from cryptography.fernet import Fernet; print('ENCRYPTION_KEY=' + Fernet.generate_key().decode())" >> .env
openssl rand -base64 32 | sed 's/^/AUTH_SECRET=/' >> .env
# Also set ADMIN_API_KEY=<anything> and OPENAI_API_KEY=<your key> (or skip — configure per tenant)

# 3. Boot it
docker compose up --build
# backend   → http://localhost:8000   (OpenAPI: /docs)
# dashboard → http://localhost:3000
# postgres  → :5432

# 4. Open http://localhost:3000 → click "Get started" → register an account → create a tenant
#    Configure LLM, upload a doc, then try the widget playground:
cd widget && npm install && npm run dev
# http://localhost:4173/playground/
```

> **Reset everything:** `docker compose down -v` wipes the `pgdata` volume — all users, tenants, documents, and conversations are gone. Next start recreates the schema.

---

## Quick start (local, no Docker)

```bash
# ─── Backend ────────────────────────────────────────────
cd backend
pip install -e .                                  # add ".[postgres]" if you have a local pg
cp ../.env.example .env
python -c "from cryptography.fernet import Fernet; print('ENCRYPTION_KEY=' + Fernet.generate_key().decode())" >> .env
# Fill in DATABASE_URL (sqlite:///bot.db works for dev), ADMIN_API_KEY, OPENAI_API_KEY
uvicorn app.main:app --reload --port 8000

# ─── Dashboard (new terminal) ───────────────────────────
cd dashboard
npm install
cp .env.example .env.local
# Set AUTH_SECRET=<long random>, BACKEND_URL=http://localhost:8000, ADMIN_API_KEY matching the backend
npm run dev   # http://localhost:3000

# ─── Widget (new terminal) ──────────────────────────────
cd widget
npm install
npm run dev   # http://localhost:4173/playground/
```

---

## Environment variables

| Variable | Where | What |
|---|---|---|
| `ENCRYPTION_KEY` | backend | Fernet key (32-byte base64). Encrypts all tenant API keys + integration secrets at rest. Leaking it leaks everything. |
| `ADMIN_API_KEY` | backend + dashboard | Bearer token the dashboard proxy uses to call `/admin/*`. Should match between services. |
| `AUTH_SECRET` | dashboard | HMAC key used to sign session cookies. ≥32 chars random. |
| `BACKEND_URL` | dashboard | URL of the backend (e.g. `http://backend:8000` in Docker, `http://localhost:8000` local). |
| `DATABASE_URL` | backend | SQLAlchemy URL. `postgresql+psycopg2://...` for prod, `sqlite:///bot.db` for dev. |
| `OPENAI_API_KEY` | backend | Default LLM key, used as a fallback if a tenant hasn't set its own. |
| `DEFAULT_LLM_MODEL` | backend | Default chat model string (e.g. `gpt-4o-mini`). |
| `DEFAULT_EMBEDDING_MODEL` | backend | Default embedding model string. |

---

## Auth + multi-user model

The dashboard ships with self-serve auth — no SSO required to get started.

| Route | Purpose |
|---|---|
| `/` | Marketing homepage. Session-aware: shows "Get started" or "Dashboard →" |
| `/login` | Sign in **or** create account (tabbed form, server actions) |
| `/tenants` | Per-user tenant list (filtered by `Tenant.owner_id`) |
| `/tenants/[slug]/*` | Tenant admin pages — gated by middleware |
| `/account` | Profile, change password, delete account (cascades to owned tenants) |
| `/docs` | Static documentation (no auth required) |

**How session works.** The dashboard sets an HMAC-signed cookie (`botify_session`) on login, signed with `AUTH_SECRET` using Web Crypto (`HMAC-SHA256`). Format: `base64url(userId|email|exp).<hmac>`. The middleware verifies it before serving `/tenants/*` or `/account/*`; otherwise redirects to `/login`. No third-party auth library — the entire flow is ~60 lines in `dashboard/lib/session.ts` + `dashboard/app/login/actions.ts`.

**How per-user isolation works.** The dashboard proxy (`/api/proxy/[...path]/route.ts`) reads the session cookie and forwards `X-User-Id` + `X-User-Email` headers to the backend. `list_tenants` filters by `owner_id`; `get_tenant` / `update_tenant` / `delete_tenant` 404 if the row's `owner_id` doesn't match. Tenants created before auth (legacy / seeded) have `owner_id = NULL` and are invisible to filtered queries — claim them with a one-off SQL update if needed.

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

| Concern | Where it lives | Editable from |
|---|---|---|
| Owner | `Tenant.owner_id` | (auto, set on creation from session) |
| System prompts (per language) | `Tenant.system_prompts[lang]` | Dashboard → System prompt |
| Chat LLM + API key | `Tenant.llm_config` + `llm_api_key_encrypted` | Dashboard → LLM |
| Embedding model + API key | `Tenant.embedding_config` + `embedding_api_key_encrypted` | Dashboard → LLM |
| Retrieval config (BM25 weight, top-K, reranker) | `Tenant.retrieval_config` + `rerank_api_key_encrypted` | Dashboard → Retrieval |
| Vector index | `chunks.tenant_id` filter | (write-only via uploads / connectors) |
| Connectors (Notion, GDrive) | `ConnectorSource` rows | Dashboard → Connectors |
| Integrations (Salesforce/Zendesk/Webhook/Email/MCP) | `Integration` rows | Dashboard → Integrations |
| CORS allowlist | `Tenant.allowed_origins[]` | Dashboard → Overview |
| i18n + branding | `Tenant.branding` + `Tenant.ui_strings` | Dashboard → Branding |
| Supported languages | `Tenant.languages[]` | Dashboard |
| Widget API key | `Tenant.widget_api_key` (auto-generated) | (read-only) |

All API keys and integration secrets are encrypted at rest with Fernet (`backend/app/crypto.py`) and never returned by any API endpoint after they're saved.

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
| Azure OpenAI | azure/gpt-4o, azure/gpt-4o-mini, azure/gpt-4.1, azure/o4-mini | Azure OpenAI embeddings via Custom |
| Azure AI Foundry | azure_ai/command-r-plus, azure_ai/mistral-large-latest, azure_ai/ai21-jamba-instruct, azure_ai/claude-opus-4-1 | — |
| Voyage AI | — | voyage-3, voyage-3-lite, voyage-code-3 |
| Cohere | — | embed-english-v3.0, embed-multilingual-v3.0 |
| Custom | any OpenAI-compatible | any OpenAI-compatible |

Azure OpenAI uses LiteLLM's `azure/<deployment>` provider plus your Azure OpenAI endpoint in `api_base` and an Azure API version such as `2024-12-01-preview`. Azure AI Foundry uses `azure_ai/<deployment>` plus an Azure AI endpoint in `api_base`; for Azure Claude, use the `/anthropic` endpoint from Foundry.

DeepSeek/Anthropic don't offer embeddings — typical config is `{ chat: DeepSeek, embeddings: OpenAI }`. The dashboard's **Test connection** button does a one-token live call against each provider before you save.

---

## Knowledge base

Three ways to get content into a tenant's index:

1. **Upload** — PDF, HTML, Markdown, plain text. Parsed → chunked → embedded inline (move to a background worker for production).
2. **Crawl URL** — fetches a single page, extracts main content with BeautifulSoup, indexes.
3. **Connectors** — pull-based sync from third-party sources. The first sync is full; subsequent syncs use the source's modified-time API (Notion `last_edited_time`, Drive `modifiedTime`) for incremental updates.

| Connector | Auth | What it syncs |
|---|---|---|
| Notion | Integration Token (`secret_...`) | Database rows + standalone pages. Requires the integration to be shared with each target page. |
| Google Drive | Service account JSON (`drive.readonly` scope) | Folders + individual files: Docs, Sheets (as CSV), Slides (as text), PDFs, plain text. |

---

## Retrieval pipeline

`backend/app/rag/` implements a configurable hybrid pipeline:

1. **Query** is embedded with the tenant's embedding provider.
2. **Vector search** — pgvector cosine distance (`<=>`) if the extension is installed; otherwise brute-force numpy scan in `LocalVectorStore`. The factory in `store.py` checks `pg_extension` at runtime and silently falls back.
3. **BM25** lexical search runs in parallel.
4. **Reciprocal Rank Fusion** merges the two ranked lists — no score normalization required.
5. **Optional cross-encoder rerank** via Cohere / Voyage / Jina, configured per tenant under Retrieval. API keys encrypted at rest.

Per-tenant isolation is enforced by `WHERE tenant_id = ?` on every query. The dashboard's Retrieval page exposes hybrid weight, top-K, and reranker provider toggles.

---

## Integrations (handoff tools)

The orchestrator advertises every enabled integration as a tool to the chat LLM. When the model emits a tool call, the matching action runs server-side and the result feeds back into the conversation.

| Integration | Auth | What it creates |
|---|---|---|
| Salesforce | OAuth `client_credentials` | Cases via Composite API |
| Zendesk | Email + API token (basic auth) | Tickets via `/api/v2/tickets.json` |
| Webhook | HMAC-signed POST | Arbitrary payload to any URL |
| Email | SMTP credentials | Email thread to configured recipients |
| MCP server | Per-server config + bearer token | Model Context Protocol tool calls (`tools/list`, `tools/call` over HTTP+JSON-RPC) |

MCP is stateless HTTP — the client skips the `initialize` handshake on each call, which keeps tool invocation to 2 round-trips. The dashboard's **Test connection** button on MCP integrations does a live `tools/list` to verify reachability + auth.

---

## Production checklist

- [ ] Lock down each tenant's `allowed_origins` (no `*`)
- [ ] Replace the idempotent `_ensure_columns()` startup with Alembic migrations
- [ ] Move document indexing + connector syncs to a background worker (Celery / RQ / Azure Queue)
- [ ] Install pgvector on Postgres so the `<=>` operator is available (the app falls back to numpy if not, but it's slow past ~50k chunks/tenant)
- [ ] Tighten FastAPI CORS to your dashboard's origin only (`backend/app/main.py:33`)
- [ ] Move `ENCRYPTION_KEY` + `AUTH_SECRET` into a secrets manager (AWS Secrets Manager / Vault) — leaking either is catastrophic
- [ ] Add rate limiting on `/api/users/register` and `/api/users/login` (slowapi or an upstream gateway)
- [ ] Add password reset / email verification (currently password-only, no recovery flow)
- [ ] Add structured logs + tracing
- [ ] Build the widget for production: `cd widget && npm run build`, serve `dist/widget.v1.js` from a CDN
- [ ] (Optional) Layer SSO / OAuth in front of `/login` for enterprise customers

---

## Extending

**New integration** (e.g. Linear):
1. Create `backend/app/actions/linear.py` implementing the `Action` protocol
2. Add to `REGISTRY` in `backend/app/actions/registry.py`
3. Add a card to `KINDS` in `dashboard/app/tenants/[slug]/integrations/IntegrationsManager.tsx` — or build a dedicated form like `MCPForm` / `SalesforceForm` for nicer UX

**New connector** (e.g. Confluence):
1. Implement `Connector` in `backend/app/connectors/confluence.py` with `fetch_pages(config, secret, since)` — accept the `since` arg for incremental sync
2. Add to `CONNECTOR_REGISTRY` in `backend/app/connectors/registry.py`
3. Add config + secret fields to `KIND_META` in `dashboard/app/tenants/[slug]/connectors/ConnectorsPage.tsx`

**New LLM provider preset**: add an entry to `PROVIDERS` in `dashboard/app/tenants/[slug]/llm/LLMConfigEditor.tsx` (or `EmbeddingConfigEditor.tsx`). The backend doesn't need changes — LiteLLM resolves providers from the `model` string prefix.

**New vector backend**: implement `VectorStore` in a new file, update the factory in `rag/store.py`.

---

## Tech stack

- **Backend**: Python 3.12, FastAPI, SQLAlchemy 2, LiteLLM, httpx, pypdf, BeautifulSoup, numpy, bcrypt, cryptography (Fernet), pgvector
- **Dashboard**: Next.js 15 (App Router, server actions), React 19, TypeScript — self-contained signed-cookie auth, no third-party auth library
- **Widget**: Vue 3 Custom Element, Vite (IIFE bundle)
- **DB**: Postgres 16 + pgvector (works with SQLite for local dev)
- **Embeddings**: pluggable; default `text-embedding-3-small`
- **Orchestration**: Docker Compose for local; deploy each service independently in prod

---

## License

[MIT](LICENSE) © Younus Ejaz
