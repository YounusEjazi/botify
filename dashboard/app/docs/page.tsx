import type { Metadata } from "next"
import Link from "next/link"
import { Logo } from "@/components/Logo"

export const metadata: Metadata = {
    title: "Docs — Bot-ify",
    description: "Botify platform documentation: quick start, widget embed, knowledge base, connectors, integrations, retrieval, security, and analytics.",
}

const sections = [
    { id: "overview",      label: "Overview" },
    { id: "quick-start",   label: "Quick Start" },
    { id: "widget-embed",  label: "Widget Embed" },
    { id: "knowledge-base", label: "Knowledge Base" },
    { id: "connectors",    label: "Connectors" },
    { id: "integrations",  label: "Integrations" },
    { id: "retrieval",     label: "Retrieval & Search" },
    { id: "security",      label: "Security" },
    { id: "analytics",     label: "Analytics" },
]

export default function DocsPage() {
    return (
        <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", flexDirection: "column" }}>

            {/* Top bar */}
            <header style={{
                borderBottom: "1px solid var(--rule)",
                background: "var(--surface)",
                padding: "0 32px",
                height: 52,
                display: "flex",
                alignItems: "center",
                gap: 20,
                position: "sticky",
                top: 0,
                zIndex: 10,
            }}>
                <Link href="/" style={{ display: "flex", alignItems: "center", gap: 9, textDecoration: "none", color: "var(--ink)" }}>
                    <Logo size={22} />
                    <span style={{ fontFamily: "var(--f-display)", fontSize: 18, letterSpacing: "-0.01em", lineHeight: 1 }}>
                        Bot<em style={{ fontStyle: "italic", color: "var(--accent)" }}>-ify</em>
                    </span>
                </Link>
                <span style={{ color: "var(--rule)", fontSize: 18, userSelect: "none" }}>/</span>
                <span style={{ fontFamily: "var(--f-mono)", fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ink-mute)" }}>
                    Docs
                </span>
                <div style={{ flex: 1 }} />
                <Link href="/tenants" className="btn small" style={{ textDecoration: "none" }}>
                    Dashboard →
                </Link>
            </header>

            {/* Body: sidebar + content */}
            <div style={{
                display: "grid",
                gridTemplateColumns: "220px 1fr",
                flex: 1,
                maxWidth: 1100,
                margin: "0 auto",
                width: "100%",
                padding: "0 32px",
                gap: 0,
                alignItems: "start",
            }}>
                {/* Sidebar */}
                <nav style={{
                    position: "sticky",
                    top: 52,
                    maxHeight: "calc(100vh - 52px)",
                    overflowY: "auto",
                    padding: "36px 24px 36px 0",
                    borderRight: "1px solid var(--rule-soft)",
                }}>
                    <div style={{
                        fontFamily: "var(--f-mono)",
                        fontSize: 10,
                        letterSpacing: "0.14em",
                        textTransform: "uppercase",
                        color: "var(--ink-mute)",
                        marginBottom: 12,
                    }}>
                        On this page
                    </div>
                    <style>{`
                        .docs-nav-link {
                            display: block;
                            padding: 6px 10px;
                            margin: 0 -10px;
                            text-decoration: none;
                            color: var(--ink-soft);
                            font-size: 13px;
                            border-left: 2px solid transparent;
                            transition: color 0.1s, border-left-color 0.1s;
                        }
                        .docs-nav-link:hover {
                            color: var(--ink);
                            border-left-color: var(--accent);
                        }
                    `}</style>
                    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                        {sections.map((s) => (
                            <a
                                key={s.id}
                                href={`#${s.id}`}
                                className="docs-nav-link"
                            >
                                {s.label}
                            </a>
                        ))}
                    </div>
                </nav>

                {/* Main content */}
                <main style={{ padding: "48px 0 80px 48px", minWidth: 0 }}>

                    {/* Page title */}
                    <div className="eyebrow" style={{ marginBottom: 4 }}>Platform Reference</div>
                    <h1 className="h-display" style={{ marginBottom: 6 }}>
                        Bot<em>-ify</em> Docs
                    </h1>
                    <p className="subdued" style={{ fontSize: 15, marginBottom: 40 }}>
                        Everything you need to deploy, configure, and extend the Botify multi-tenant chatbot platform.
                    </p>

                    <hr className="rule" />

                    {/* ── Overview ── */}
                    <section id="overview" style={{ scrollMarginTop: 72, marginBottom: 48 }}>
                        <h2 className="h-section" style={{ marginBottom: 12 }}>Overview</h2>
                        <p style={{ color: "var(--ink-soft)", lineHeight: 1.7, maxWidth: 68 + "ch" }}>
                            Botify is a <strong>multi-tenant AI chatbot platform</strong>. Each tenant is a fully isolated deployment with its own:
                        </p>
                        <div className="card" style={{ marginTop: 20 }}>
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th>Component</th>
                                        <th>What it controls</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr><td><strong>Widget</strong></td><td>The embeddable chat UI served to end users</td></tr>
                                    <tr><td><strong>Knowledge base</strong></td><td>Chunked, embedded documents for RAG retrieval</td></tr>
                                    <tr><td><strong>LLM config</strong></td><td>Model selection, system prompt, temperature, token limits</td></tr>
                                    <tr><td><strong>Integrations</strong></td><td>Ticketing handoff (Salesforce, Zendesk, Webhook, Email, MCP)</td></tr>
                                    <tr><td><strong>Connectors</strong></td><td>Source syncs from Notion, Google Drive, and more</td></tr>
                                    <tr><td><strong>Branding</strong></td><td>Logo, colors, and chat bubble appearance</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </section>

                    <hr className="rule" />

                    {/* ── Quick Start ── */}
                    <section id="quick-start" style={{ scrollMarginTop: 72, marginBottom: 48 }}>
                        <h2 className="h-section" style={{ marginBottom: 12 }}>Quick Start</h2>
                        <p style={{ color: "var(--ink-soft)", lineHeight: 1.7, maxWidth: "68ch", marginBottom: 20 }}>
                            Get from zero to a live chatbot in four steps.
                        </p>
                        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                            {[
                                { step: "1", title: "Create a tenant", body: <>Go to <Link href="/tenants/new">Tenants → New tenant</Link>. Choose a unique slug — it appears in embed URLs and API paths.</> },
                                { step: "2", title: "Configure the LLM", body: "Open Settings → LLM. Select a provider and model, set the system prompt, and adjust temperature and token limits to match your use case." },
                                { step: "3", title: "Upload documents", body: "Go to Knowledge Base. Upload PDFs, HTML pages, plain text, or Markdown. Documents are chunked, embedded, and indexed automatically." },
                                { step: "4", title: "Embed the widget", body: <>Copy the script tag from the Widget page and paste it into your site's HTML. See the <a href="#widget-embed">Widget Embed</a> section for the full snippet.</> },
                            ].map(({ step, title, body }) => (
                                <div key={step} className="card" style={{ display: "flex", gap: 18, alignItems: "flex-start" }}>
                                    <div style={{
                                        fontFamily: "var(--f-mono)",
                                        fontSize: 13,
                                        fontWeight: 500,
                                        color: "var(--surface)",
                                        background: "var(--ink)",
                                        width: 28,
                                        height: 28,
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        flexShrink: 0,
                                        marginTop: 1,
                                    }}>
                                        {step}
                                    </div>
                                    <div>
                                        <div style={{ fontWeight: 600, marginBottom: 4 }}>{title}</div>
                                        <div style={{ color: "var(--ink-soft)", fontSize: 13, lineHeight: 1.6 }}>{body}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>

                    <hr className="rule" />

                    {/* ── Widget Embed ── */}
                    <section id="widget-embed" style={{ scrollMarginTop: 72, marginBottom: 48 }}>
                        <h2 className="h-section" style={{ marginBottom: 12 }}>Widget Embed</h2>
                        <p style={{ color: "var(--ink-soft)", lineHeight: 1.7, maxWidth: "68ch", marginBottom: 20 }}>
                            Add a single <code style={{ fontFamily: "var(--f-mono)", fontSize: 12, background: "var(--surface-2)", padding: "1px 5px" }}>&lt;script&gt;</code> tag to any page to embed the Botify chat widget. The widget loads asynchronously and does not block page rendering.
                        </p>
                        <div className="codeblock">{`<script
  src="https://cdn.example.com/botify-widget.js"
  data-tenant="YOUR_SLUG"
  data-api-base="https://your-api.com"
  async
></script>`}</div>
                        <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
                            {[
                                { attr: "data-tenant", desc: "Your tenant slug (e.g. acme-support). Required." },
                                { attr: "data-api-base", desc: "Base URL of your Botify API instance. Defaults to the hosted service." },
                                { attr: "data-locale", desc: "BCP 47 locale override (e.g. fr-FR). Defaults to browser language." },
                                { attr: "data-theme", desc: "\"light\" or \"dark\". Defaults to auto (follows OS preference)." },
                            ].map(({ attr, desc }) => (
                                <div key={attr} style={{ display: "flex", gap: 12, fontSize: 13 }}>
                                    <code style={{ fontFamily: "var(--f-mono)", fontSize: 12, color: "var(--accent)", flexShrink: 0, minWidth: 160 }}>{attr}</code>
                                    <span style={{ color: "var(--ink-soft)" }}>{desc}</span>
                                </div>
                            ))}
                        </div>
                        <div className="notice" style={{ marginTop: 20 }}>
                            The widget API key is a tenant identifier, not a secret. Restrict which origins may call your API using the <strong>origin allowlist</strong> in Settings → Security.
                        </div>
                    </section>

                    <hr className="rule" />

                    {/* ── Knowledge Base ── */}
                    <section id="knowledge-base" style={{ scrollMarginTop: 72, marginBottom: 48 }}>
                        <h2 className="h-section" style={{ marginBottom: 12 }}>Knowledge Base</h2>
                        <p style={{ color: "var(--ink-soft)", lineHeight: 1.7, maxWidth: "68ch", marginBottom: 20 }}>
                            The knowledge base is the document store that backs retrieval-augmented generation (RAG). Upload files manually or sync them from connected sources.
                        </p>
                        <div className="card" style={{ marginBottom: 16 }}>
                            <div style={{ fontFamily: "var(--f-mono)", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ink-mute)", marginBottom: 12 }}>Supported formats</div>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                {["PDF", "HTML", "Plain text (.txt)", "Markdown (.md)"].map((f) => (
                                    <span key={f} className="badge">{f}</span>
                                ))}
                            </div>
                        </div>
                        <div className="card">
                            <div style={{ fontFamily: "var(--f-mono)", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ink-mute)", marginBottom: 12 }}>Indexing pipeline</div>
                            <ol style={{ margin: 0, paddingLeft: 20, color: "var(--ink-soft)", fontSize: 13, lineHeight: 1.9 }}>
                                <li><strong>Parse</strong> — text is extracted from the source format</li>
                                <li><strong>Chunk</strong> — text is split into overlapping passages (configurable size &amp; overlap)</li>
                                <li><strong>Embed</strong> — each chunk is encoded into a dense vector using the configured embedding model</li>
                                <li><strong>Index</strong> — vectors and BM25 tokens are written to the search index</li>
                            </ol>
                        </div>
                        <p style={{ color: "var(--ink-soft)", fontSize: 13, lineHeight: 1.7, marginTop: 16 }}>
                            Connector documents (Notion, Google Drive) follow the same pipeline and are re-indexed on every sync. A document&rsquo;s status badge shows <span className="badge">indexing</span> while processing and <span className="badge ready">ready</span> when complete.
                        </p>
                    </section>

                    <hr className="rule" />

                    {/* ── Connectors ── */}
                    <section id="connectors" style={{ scrollMarginTop: 72, marginBottom: 48 }}>
                        <h2 className="h-section" style={{ marginBottom: 12 }}>Connectors</h2>
                        <p style={{ color: "var(--ink-soft)", lineHeight: 1.7, maxWidth: "68ch", marginBottom: 20 }}>
                            Connectors pull documents from external sources into the knowledge base. Click <strong>Sync now</strong> to trigger a manual sync at any time.
                        </p>
                        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                            <div className="card">
                                <div className="card-header" style={{ marginBottom: 8 }}>
                                    <h3 style={{ fontFamily: "var(--f-display)", fontSize: 18, fontWeight: 400, margin: 0 }}>Notion</h3>
                                    <span className="badge">connector</span>
                                </div>
                                <ul style={{ margin: 0, paddingLeft: 20, color: "var(--ink-soft)", fontSize: 13, lineHeight: 1.8 }}>
                                    <li>Requires a Notion <strong>Integration Token</strong> (starts with <code style={{ fontFamily: "var(--f-mono)", fontSize: 12 }}>secret_...</code>)</li>
                                    <li>Provide one or more database or page IDs to sync</li>
                                    <li>The integration must be shared with each target database/page in Notion</li>
                                    <li>Sync status: <span className="badge">idle</span> → <span className="badge pending">syncing</span> → <span className="badge ready">ready</span> / <span className="badge failed">error</span></li>
                                </ul>
                            </div>
                            <div className="card">
                                <div className="card-header" style={{ marginBottom: 8 }}>
                                    <h3 style={{ fontFamily: "var(--f-display)", fontSize: 18, fontWeight: 400, margin: 0 }}>Google Drive</h3>
                                    <span className="badge">connector</span>
                                </div>
                                <ul style={{ margin: 0, paddingLeft: 20, color: "var(--ink-soft)", fontSize: 13, lineHeight: 1.8 }}>
                                    <li>Requires a <strong>service account JSON key</strong> with <code style={{ fontFamily: "var(--f-mono)", fontSize: 12 }}>drive.readonly</code> scope</li>
                                    <li>Share the target Drive folder or files with the service account email</li>
                                    <li>Syncs Docs, Sheets (as CSV), Slides (as text), and binary files (PDF, plain text)</li>
                                </ul>
                            </div>
                        </div>
                    </section>

                    <hr className="rule" />

                    {/* ── Integrations ── */}
                    <section id="integrations" style={{ scrollMarginTop: 72, marginBottom: 48 }}>
                        <h2 className="h-section" style={{ marginBottom: 12 }}>Integrations (Ticketing)</h2>
                        <p style={{ color: "var(--ink-soft)", lineHeight: 1.7, maxWidth: "68ch", marginBottom: 20 }}>
                            When the chatbot cannot resolve a conversation, it can hand off to a ticketing system. Configure one or more integrations under <strong>Settings → Integrations</strong>.
                        </p>
                        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                            <table className="table" style={{ margin: 0 }}>
                                <thead>
                                    <tr>
                                        <th style={{ paddingLeft: 24 }}>Integration</th>
                                        <th>Auth method</th>
                                        <th>Creates</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td style={{ paddingLeft: 24 }}><strong>Salesforce</strong></td>
                                        <td><span style={{ fontFamily: "var(--f-mono)", fontSize: 12 }}>OAuth client_credentials</span></td>
                                        <td>Cases</td>
                                    </tr>
                                    <tr>
                                        <td style={{ paddingLeft: 24 }}><strong>Zendesk</strong></td>
                                        <td>API token</td>
                                        <td>Tickets</td>
                                    </tr>
                                    <tr>
                                        <td style={{ paddingLeft: 24 }}><strong>Webhook</strong></td>
                                        <td>HMAC-signed POST</td>
                                        <td>Arbitrary payload to any URL</td>
                                    </tr>
                                    <tr>
                                        <td style={{ paddingLeft: 24 }}><strong>Email</strong></td>
                                        <td>SMTP credentials</td>
                                        <td>Email thread</td>
                                    </tr>
                                    <tr>
                                        <td style={{ paddingLeft: 24, paddingBottom: 16 }}><strong>MCP server</strong></td>
                                        <td>Per-server config</td>
                                        <td>Model Context Protocol tool calls</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                        <div className="notice" style={{ marginTop: 16 }}>
                            All integration credentials (API keys, client secrets, SMTP passwords) are encrypted at rest with Fernet before being stored.
                        </div>
                    </section>

                    <hr className="rule" />

                    {/* ── Retrieval & Search ── */}
                    <section id="retrieval" style={{ scrollMarginTop: 72, marginBottom: 48 }}>
                        <h2 className="h-section" style={{ marginBottom: 12 }}>Retrieval &amp; Search</h2>
                        <p style={{ color: "var(--ink-soft)", lineHeight: 1.7, maxWidth: "68ch", marginBottom: 20 }}>
                            Botify uses a hybrid retrieval pipeline that combines sparse and dense signals. Configure all options under <strong>Settings → Retrieval</strong>.
                        </p>
                        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                            <div className="card">
                                <div style={{ fontWeight: 600, marginBottom: 6 }}>Hybrid search</div>
                                <p style={{ margin: 0, color: "var(--ink-soft)", fontSize: 13, lineHeight: 1.7 }}>
                                    BM25 lexical retrieval and vector cosine similarity are run in parallel. The ranked lists are merged using <strong>Reciprocal Rank Fusion (RRF)</strong>, which balances exact-keyword and semantic matching without requiring score normalization.
                                </p>
                            </div>
                            <div className="card">
                                <div style={{ fontWeight: 600, marginBottom: 6 }}>Cross-encoder reranking <span className="badge" style={{ marginLeft: 6, verticalAlign: "middle" }}>optional</span></div>
                                <p style={{ margin: 0, color: "var(--ink-soft)", fontSize: 13, lineHeight: 1.7 }}>
                                    After the first-pass retrieval, a cross-encoder model scores each (query, passage) pair to produce a final ranked list. Supported providers:
                                </p>
                                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                                    {["Cohere", "Voyage AI", "Jina AI"].map((p) => (
                                        <span key={p} className="badge">{p}</span>
                                    ))}
                                </div>
                            </div>
                            <div className="card">
                                <div style={{ fontWeight: 600, marginBottom: 6 }}>Top-K &amp; context window</div>
                                <p style={{ margin: 0, color: "var(--ink-soft)", fontSize: 13, lineHeight: 1.7 }}>
                                    Control how many passages are retrieved (top-K) and how they are injected into the LLM context. Setting top-K too high increases latency and token cost; too low reduces recall. A value of 5–10 suits most deployments.
                                </p>
                            </div>
                        </div>
                    </section>

                    <hr className="rule" />

                    {/* ── Security ── */}
                    <section id="security" style={{ scrollMarginTop: 72, marginBottom: 48 }}>
                        <h2 className="h-section" style={{ marginBottom: 12 }}>Security</h2>
                        <p style={{ color: "var(--ink-soft)", lineHeight: 1.7, maxWidth: "68ch", marginBottom: 20 }}>
                            Botify is designed with a layered security model. Here&rsquo;s what each layer does.
                        </p>
                        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                            <div className="card">
                                <div style={{ fontWeight: 600, marginBottom: 4 }}>Origin allowlist</div>
                                <p style={{ margin: 0, color: "var(--ink-soft)", fontSize: 13, lineHeight: 1.7 }}>
                                    The widget embeds a tenant slug in plain HTML. The <strong>origin allowlist</strong> (Settings → Security) is the real access boundary: the API rejects requests from origins not on the list. Always configure this before going to production.
                                </p>
                            </div>
                            <div className="card">
                                <div style={{ fontWeight: 600, marginBottom: 4 }}>Secrets encryption</div>
                                <p style={{ margin: 0, color: "var(--ink-soft)", fontSize: 13, lineHeight: 1.7 }}>
                                    All tenant secrets — LLM API keys, connector tokens, integration credentials — are encrypted at rest using <strong>Fernet</strong> (AES-128-CBC + HMAC-SHA256). The encryption key is stored separately from the database.
                                </p>
                            </div>
                            <div className="card">
                                <div style={{ fontWeight: 600, marginBottom: 4 }}>Guardrails</div>
                                <p style={{ margin: 0, color: "var(--ink-soft)", fontSize: 13, lineHeight: 1.7 }}>
                                    Every incoming user message is passed through an <strong>LLM-based moderation</strong> step before retrieval. Messages flagged as harmful, off-topic (relative to the system prompt), or prompt-injection attempts are rejected before they reach the main model.
                                </p>
                            </div>
                        </div>
                    </section>

                    <hr className="rule" />

                    {/* ── Analytics ── */}
                    <section id="analytics" style={{ scrollMarginTop: 72, marginBottom: 48 }}>
                        <h2 className="h-section" style={{ marginBottom: 12 }}>Analytics</h2>
                        <p style={{ color: "var(--ink-soft)", lineHeight: 1.7, maxWidth: "68ch", marginBottom: 20 }}>
                            The Analytics tab (inside each tenant) surfaces usage data without requiring external tooling.
                        </p>
                        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                            <table className="table" style={{ margin: 0 }}>
                                <thead>
                                    <tr>
                                        <th style={{ paddingLeft: 24 }}>Metric</th>
                                        <th>Description</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td style={{ paddingLeft: 24 }}><strong>Conversation volume</strong></td>
                                        <td>Total conversations opened, per day (30-day chart)</td>
                                    </tr>
                                    <tr>
                                        <td style={{ paddingLeft: 24 }}><strong>Message counts</strong></td>
                                        <td>User and assistant messages, broken down by conversation</td>
                                    </tr>
                                    <tr>
                                        <td style={{ paddingLeft: 24 }}><strong>Ratings</strong></td>
                                        <td>Thumbs-up / thumbs-down feedback from end users</td>
                                    </tr>
                                    <tr>
                                        <td style={{ paddingLeft: 24 }}><strong>Top questions</strong></td>
                                        <td>Most frequently asked user messages, clustered by similarity</td>
                                    </tr>
                                    <tr>
                                        <td style={{ paddingLeft: 24, paddingBottom: 16 }}><strong>Language breakdown</strong></td>
                                        <td>Distribution of detected user message languages</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                        <p style={{ color: "var(--ink-mute)", fontSize: 12, fontFamily: "var(--f-mono)", marginTop: 14 }}>
                            All analytics data is scoped to the tenant. No cross-tenant data is ever exposed.
                        </p>
                    </section>

                </main>
            </div>
        </div>
    )
}
