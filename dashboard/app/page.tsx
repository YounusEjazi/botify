import Link from "next/link"
import { Logo } from "@/components/Logo"
import { cookies } from "next/headers"
import { verifySession, SESSION_COOKIE } from "@/lib/session"
import { logoutAction } from "@/app/login/actions"

/* ─── Marketing homepage — server component, no client hooks ────────────── */

export const metadata = {
    title: "Bot-ify — Multi-tenant AI chatbot platform",
    description:
        "Deploy AI chatbots for any business. Full data isolation, RAG knowledge base, and embeddable widget. One platform, unlimited clients.",
}

const EMBED_SNIPPET = `<script
  src="https://cdn.botify.io/widget.js"
  data-tenant="acme-corp"
  async
></script>`

const INTEGRATIONS = [
    "Notion",
    "Google Drive",
    "Salesforce",
    "Zendesk",
    "Webhook",
    "Email",
    "MCP servers",
]

const FEATURES = [
    {
        title: "Multi-tenant by design",
        body: "One platform, unlimited clients. Full data isolation per tenant — separate vector stores, credentials, and LLM configs.",
    },
    {
        title: "RAG knowledge base",
        body: "Upload PDFs, sync from Notion or Drive, crawl URLs. Hybrid BM25 + vector search retrieves the right context every time.",
    },
    {
        title: "Native integrations",
        body: "Hand off to Salesforce, Zendesk, or any webhook. MCP tool protocol built in for model-agnostic function calling.",
    },
    {
        title: "Embeddable widget",
        body: "One <script> tag. Loads async, matches any brand. Deploy in under five minutes with zero backend changes.",
    },
    {
        title: "LLM agnostic",
        body: "GPT-4o, Claude, Gemini, or local models via Ollama. Switch models per tenant without rewiring your stack.",
    },
    {
        title: "Analytics",
        body: "Conversation volume, CSAT ratings, and language breakdown. Every metric scoped to the tenant — no data bleed.",
    },
]

const HOW_IT_WORKS = [
    {
        step: "01",
        title: "Create a tenant",
        body: "Register a client workspace in seconds. Each tenant gets its own API key, widget token, and isolated data store.",
    },
    {
        step: "02",
        title: "Connect your knowledge",
        body: "Upload documents, paste a Notion URL, or crawl a site. Botify indexes and chunks automatically using BM25 + embeddings.",
    },
    {
        step: "03",
        title: "Embed the widget",
        body: "Copy one script tag into your client's site. The chatbot is live — no build step, no iframe gymnastics.",
    },
]

export default async function HomePage() {
    const cookieStore = await cookies()
    const session = await verifySession(cookieStore.get(SESSION_COOKIE)?.value)

    return (
        <>
            <style>{`
                .home-nav {
                    position: sticky;
                    top: 0;
                    z-index: 100;
                    height: 56px;
                    background: var(--surface);
                    border-bottom: 1px solid var(--rule);
                    display: flex;
                    align-items: center;
                }
                .home-nav-inner {
                    max-width: 1100px;
                    margin: 0 auto;
                    padding: 0 32px;
                    width: 100%;
                    display: flex;
                    align-items: center;
                    gap: 24px;
                }
                .home-nav-logo {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    text-decoration: none;
                    color: var(--ink);
                    font-family: var(--f-display);
                    font-size: 22px;
                    letter-spacing: -0.01em;
                    flex: 1;
                }
                .home-nav-logo em { font-style: italic; color: var(--accent); }
                .home-nav-links {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                }
                .home-nav-link {
                    padding: 6px 12px;
                    font-size: 14px;
                    color: var(--ink-soft);
                    text-decoration: none;
                    font-weight: 500;
                }
                .home-nav-link:hover { color: var(--accent); }

                .home-hero {
                    min-height: calc(100vh - 56px);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: var(--bg);
                    padding: 80px 32px;
                }
                .home-hero-inner {
                    max-width: 720px;
                    width: 100%;
                    text-align: center;
                }
                .home-hero .h-display {
                    font-size: clamp(40px, 7vw, 72px);
                    margin-bottom: 20px;
                    white-space: pre-line;
                }
                .home-hero-subtitle {
                    font-size: 18px;
                    color: var(--ink-mute);
                    max-width: 56ch;
                    margin: 0 auto 36px;
                    line-height: 1.6;
                }
                .home-hero-ctas {
                    display: flex;
                    gap: 12px;
                    justify-content: center;
                    flex-wrap: wrap;
                    margin-bottom: 48px;
                }
                .home-hero-code {
                    text-align: left;
                    max-width: 520px;
                    margin: 0 auto;
                    border-radius: 0;
                    border: 1px solid var(--rule);
                }
                .home-hero-code-label {
                    font-family: var(--f-mono);
                    font-size: 10px;
                    letter-spacing: 0.12em;
                    text-transform: uppercase;
                    color: var(--ink-mute);
                    padding: 8px 18px 0;
                    background: var(--surface-2);
                    border-bottom: 1px solid var(--rule);
                }

                .home-section {
                    padding: 80px 32px;
                }
                .home-section-inner {
                    max-width: 1100px;
                    margin: 0 auto;
                }

                .home-integrations {
                    background: var(--surface);
                    border-top: 1px solid var(--rule);
                    border-bottom: 1px solid var(--rule);
                    padding: 32px;
                }
                .home-integrations-inner {
                    max-width: 1100px;
                    margin: 0 auto;
                    display: flex;
                    align-items: center;
                    gap: 16px;
                    flex-wrap: wrap;
                }
                .home-integrations-label {
                    font-family: var(--f-mono);
                    font-size: 11px;
                    letter-spacing: 0.1em;
                    text-transform: uppercase;
                    color: var(--ink-mute);
                    white-space: nowrap;
                    margin-right: 8px;
                }
                .home-integrations-pills {
                    display: flex;
                    gap: 8px;
                    flex-wrap: wrap;
                }

                .home-features-grid {
                    display: grid;
                    grid-template-columns: repeat(3, 1fr);
                    gap: 1px;
                    background: var(--rule);
                    border: 1px solid var(--rule);
                }
                .home-feature-card {
                    background: var(--surface);
                    padding: 28px 24px;
                }
                .home-feature-title {
                    font-family: var(--f-display);
                    font-size: 20px;
                    font-weight: 400;
                    margin: 0 0 8px;
                    color: var(--ink);
                }
                .home-feature-body {
                    font-size: 14px;
                    color: var(--ink-mute);
                    line-height: 1.6;
                    margin: 0;
                }

                .home-steps-grid {
                    display: grid;
                    grid-template-columns: repeat(3, 1fr);
                    gap: 24px;
                }
                .home-step-card {
                    background: var(--surface);
                    border: 1px solid var(--rule);
                    padding: 28px 24px;
                }
                .home-step-number {
                    font-family: var(--f-mono);
                    font-size: 11px;
                    letter-spacing: 0.12em;
                    color: var(--accent);
                    margin: 0 0 12px;
                }
                .home-step-title {
                    font-family: var(--f-display);
                    font-size: 22px;
                    font-weight: 400;
                    margin: 0 0 10px;
                    color: var(--ink);
                }
                .home-step-body {
                    font-size: 14px;
                    color: var(--ink-mute);
                    line-height: 1.6;
                    margin: 0;
                }

                .home-cta-section {
                    background: var(--ink);
                    padding: 80px 32px;
                    text-align: center;
                }
                .home-cta-section .h-display {
                    color: var(--surface);
                    margin-bottom: 32px;
                }
                .home-cta-section .h-display em { color: var(--accent-soft); }

                .home-footer {
                    background: var(--surface-2);
                    border-top: 1px solid var(--rule);
                    padding: 24px 32px;
                }
                .home-footer-inner {
                    max-width: 1100px;
                    margin: 0 auto;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 16px;
                    flex-wrap: wrap;
                }
                .home-footer-copy {
                    font-family: var(--f-mono);
                    font-size: 12px;
                    color: var(--ink-mute);
                }
                .home-footer-links {
                    display: flex;
                    gap: 16px;
                }
                .home-footer-links a {
                    font-family: var(--f-mono);
                    font-size: 12px;
                    color: var(--ink-mute);
                    text-decoration: none;
                }
                .home-footer-links a:hover { color: var(--accent); }

                @media (max-width: 800px) {
                    .home-features-grid {
                        grid-template-columns: 1fr;
                    }
                    .home-steps-grid {
                        grid-template-columns: 1fr;
                    }
                    .home-integrations-inner {
                        flex-direction: column;
                        align-items: flex-start;
                    }
                }
            `}</style>

            {/* ── Sticky nav ──────────────────────────────────────────────── */}
            <nav className="home-nav">
                <div className="home-nav-inner">
                    <Link href="/" className="home-nav-logo">
                        <Logo size={28} />
                        Bot<em>-ify</em>
                    </Link>
                    <div className="home-nav-links">
                        <Link href="/docs" className="home-nav-link">Docs</Link>
                        {session ? (
                            <>
                                <Link href="/account" className="home-nav-link" style={{ fontSize: 13, color: "var(--ink-mute)" }}>
                                    {session.email}
                                </Link>
                                <Link href="/tenants" className="btn primary small" style={{ textDecoration: "none", marginLeft: 8 }}>
                                    Dashboard →
                                </Link>
                                <form action={logoutAction} style={{ display: "inline" }}>
                                    <button type="submit" className="home-nav-link" style={{ background: "none", border: "none", cursor: "pointer", font: "inherit" }}>
                                        Sign out
                                    </button>
                                </form>
                            </>
                        ) : (
                            <>
                                <Link href="/login" className="home-nav-link">Sign in</Link>
                                <Link href="/login" className="btn primary small" style={{ textDecoration: "none", marginLeft: 8 }}>
                                    Get started
                                </Link>
                            </>
                        )}
                    </div>
                </div>
            </nav>

            {/* ── Hero ────────────────────────────────────────────────────── */}
            <section className="home-hero">
                <div className="home-hero-inner">
                    <p className="eyebrow" style={{ marginBottom: 16 }}>Multi-tenant AI chatbot platform</p>
                    <h1 className="h-display">
                        {"Deploy AI chatbots.\nFor "}
                        <em>any</em>
                        {" business."}
                    </h1>
                    <p className="home-hero-subtitle">
                        Botify gives each of your clients their own isolated chatbot,
                        knowledge base, and integrations — configured from a shared dashboard.
                    </p>
                    <div className="home-hero-ctas">
                        {session ? (
                            <Link href="/tenants" className="btn primary" style={{ fontSize: 15, padding: "12px 24px", textDecoration: "none" }}>
                                Go to Dashboard →
                            </Link>
                        ) : (
                            <Link href="/login" className="btn primary" style={{ fontSize: 15, padding: "12px 24px", textDecoration: "none" }}>
                                Get started →
                            </Link>
                        )}
                        <Link href="/docs" className="btn" style={{ fontSize: 15, padding: "12px 24px", textDecoration: "none" }}>
                            View docs →
                        </Link>
                    </div>

                    <div className="home-hero-code">
                        <div className="home-hero-code-label">Embed snippet</div>
                        <pre className="codeblock" style={{ margin: 0, borderRadius: 0 }}>{EMBED_SNIPPET}</pre>
                    </div>
                </div>
            </section>

            {/* ── Integrations strip ──────────────────────────────────────── */}
            <div className="home-integrations">
                <div className="home-integrations-inner">
                    <span className="home-integrations-label">Connects to your tools</span>
                    <div className="home-integrations-pills">
                        {INTEGRATIONS.map((name) => (
                            <span key={name} className="badge">{name}</span>
                        ))}
                    </div>
                </div>
            </div>

            {/* ── Features grid ───────────────────────────────────────────── */}
            <section className="home-section" style={{ background: "var(--bg)" }}>
                <div className="home-section-inner">
                    <p className="eyebrow" style={{ marginBottom: 8 }}>Features</p>
                    <h2 className="h-section" style={{ marginBottom: 32 }}>
                        Everything you need, nothing you don&apos;t.
                    </h2>
                    <div className="home-features-grid">
                        {FEATURES.map((f) => (
                            <div key={f.title} className="home-feature-card">
                                <h3 className="home-feature-title">{f.title}</h3>
                                <p className="home-feature-body">{f.body}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── How it works ────────────────────────────────────────────── */}
            <section className="home-section" style={{ background: "var(--surface)" }}>
                <div className="home-section-inner">
                    <p className="eyebrow" style={{ marginBottom: 8 }}>How it works</p>
                    <h2 className="h-section" style={{ marginBottom: 32 }}>
                        Up and running in three steps.
                    </h2>
                    <div className="home-steps-grid">
                        {HOW_IT_WORKS.map((s) => (
                            <div key={s.step} className="home-step-card">
                                <p className="home-step-number">{s.step}</p>
                                <h3 className="home-step-title">{s.title}</h3>
                                <p className="home-step-body">{s.body}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── Bottom CTA ──────────────────────────────────────────────── */}
            <section className="home-cta-section">
                <h2 className="h-display">
                    Ready to deploy your<br />
                    <em>first chatbot?</em>
                </h2>
                <Link
                    href="/login"
                    className="btn"
                    style={{
                        background: "var(--accent)",
                        color: "var(--surface)",
                        borderColor: "var(--accent)",
                        fontSize: 16,
                        padding: "14px 32px",
                        textDecoration: "none",
                    }}
                >
                    Get started free →
                </Link>
            </section>

            {/* ── Footer ──────────────────────────────────────────────────── */}
            <footer className="home-footer">
                <div className="home-footer-inner">
                    <span className="home-footer-copy">© 2025 Bot-ify</span>
                    <div className="home-footer-links">
                        <Link href="/docs">Docs</Link>
                        <a href="https://github.com/YounusEjazi/botify" target="_blank" rel="noopener noreferrer">
                            GitHub
                        </a>
                    </div>
                </div>
            </footer>
        </>
    )
}
