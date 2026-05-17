# Widget

Embeddable, tenant-aware chat widget. One script tag per page; the widget reads its tenant from the script's `data-` attributes and fetches everything else from the backend.

## Embed snippet

This is what your customers paste on their site:

```html
<script
    src="https://cdn.yours.com/widget.v1.js"
    data-tenant="acme"
    data-api-base="https://api.yours.com"
    data-position="bottom-right"
    async
></script>
```

## Modes

**Popup** (default) — floating button at the bottom of the page, panel slides up when clicked.

```html
<script src="…/widget.v1.js"
        data-tenant="acme"
        data-mode="popup"
        data-position="bottom-right"
        async></script>
```

**Inline** — embedded inside a host element:

```html
<div id="my-bot" style="width: 400px; height: 600px"></div>

<script src="…/widget.v1.js"
        data-tenant="acme"
        data-mode="inline"
        data-target="#my-bot"
        async></script>
```

## Develop

```bash
cd widget
npm install
# Make sure the backend is running on :8000 with seeded tenants
npm run dev          # http://localhost:4173/playground/
```

## Build

```bash
npm run build        # → dist/widget.v1.js
```

Ship `dist/widget.v1.js` to your CDN. Use a versioned path (`widget.v1.js`, `widget.v2.js`) so existing customers don't break when you ship breaking changes.

## What's NOT in the widget

By design, the widget is the dumb client. All policy lives server-side:

- System prompts → tenant config (DB)
- Knowledge base → tenant's RAG index
- Tools / integrations → tenant's enabled actions
- Branding → tenant config (fetched on load)
- Languages → tenant config

The widget just renders messages, posts user input, and shows the ticket form when the server tells it to.
