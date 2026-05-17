# Dashboard

Next.js admin UI for managing tenants, prompts, knowledge, integrations, and conversations.

## Setup

```bash
cd dashboard
npm install
cp .env.example .env.local
# Edit .env.local to match the backend's ADMIN_API_KEY
npm run dev   # http://localhost:3000
```

The backend must be running on `BACKEND_URL` (default `http://localhost:8000`).

## What's inside

```
app/
  page.tsx                        Tenant list (home)
  tenants/new/                    Create new tenant
  tenants/[slug]/
    layout.tsx                    Shared sidebar
    page.tsx                      Overview + embed snippet
    prompt/                       System prompt editor (per language)
    branding/                     Colors, logo, i18n strings
    knowledge/                    Document upload + URL ingestion
    integrations/                 Salesforce / webhook / email config
    conversations/                Session viewer
  api/proxy/[...path]/route.ts    Server-side proxy injecting ADMIN_API_KEY
```

## Auth model

The `ADMIN_API_KEY` lives only in server-side env. The browser never sees it — every dashboard action goes through `/api/proxy/*`, which forwards to the backend's `/admin/*` endpoints with the Bearer header attached. Put your own SSO/auth in front of this app before going to production.

## Design notes

Editorial typesetting aesthetic — Instrument Serif headlines, IBM Plex Sans body, JetBrains Mono for slugs and code. The single sienna accent (`--accent`) is reserved for active states and the primary CTA. The look is intentionally not "generic SaaS dashboard."
