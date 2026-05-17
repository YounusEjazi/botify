import { api } from "@/lib/api"
import Link from "next/link"

export default async function TenantOverview({
    params,
}: {
    params: Promise<{ slug: string }>
}) {
    const { slug } = await params
    const tenant = await api.getTenant(slug)
    const [integrations, docs, convos] = await Promise.all([
        api.listIntegrations(slug).catch(() => []),
        api.listDocuments(slug).catch(() => []),
        api.listConversations(slug).catch(() => []),
    ])

    const apiBase = process.env.NEXT_PUBLIC_API_BASE || "https://api.yours.com"
    const snippet = `<script
    src="https://cdn.yours.com/widget.v1.js"
    data-tenant="${tenant.slug}"
    data-api-base="${apiBase}"
    data-position="bottom-right"
    async
></script>`

    return (
        <div>
            <div className="eyebrow">Tenant</div>
            <h1 className="h-display">{tenant.name}</h1>
            <p className="subdued">
                Created {new Date(tenant.created_at).toLocaleDateString()}.
                Slug: <code style={{ fontFamily: "var(--f-mono)" }}>{tenant.slug}</code>.
            </p>

            <div className="card">
                <div className="card-header">
                    <h2 className="card-title">Embed snippet</h2>
                    <span className="badge">copy & paste</span>
                </div>
                <p className="subdued" style={{ marginBottom: 12 }}>
                    Send this to your customer. They drop it on their site once and the
                    widget mounts itself.
                </p>
                <pre className="codeblock">{snippet}</pre>
            </div>

            <div style={{
                display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 16, marginTop: 16,
            }}>
                <Stat label="Languages"    value={tenant.languages.join(", ") || "—"} />
                <Stat label="Documents"    value={docs.length}
                      href={`/tenants/${slug}/knowledge`} />
                <Stat label="Integrations" value={integrations.filter(i => i.enabled).length}
                      href={`/tenants/${slug}/integrations`} />
                <Stat label="Conversations" value={convos.length}
                      href={`/tenants/${slug}/conversations`} />
            </div>

            <div className="card" style={{ marginTop: 24 }}>
                <div className="card-header">
                    <h2 className="card-title">Allowed origins</h2>
                </div>
                {tenant.allowed_origins.length === 0 ? (
                    <p className="subdued" style={{ margin: 0 }}>
                        No origins configured. The widget will be blocked from every browser
                        until you add at least one.
                    </p>
                ) : tenant.allowed_origins.includes("*") ? (
                    <div className="notice error" style={{ margin: 0 }}>
                        Origins are set to <code>*</code>. Fine for local dev — lock this down
                        before going live.
                    </div>
                ) : (
                    <ul style={{ fontFamily: "var(--f-mono)", fontSize: 13, lineHeight: 1.9, margin: 0, paddingLeft: 18 }}>
                        {tenant.allowed_origins.map((o) => <li key={o}>{o}</li>)}
                    </ul>
                )}
            </div>
        </div>
    )
}

function Stat({ label, value, href }: { label: string; value: number | string; href?: string }) {
    const body = (
        <div className="card" style={{ height: "100%" }}>
            <div style={{ fontFamily: "var(--f-mono)", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ink-mute)" }}>
                {label}
            </div>
            <div style={{ fontFamily: "var(--f-display)", fontSize: 36, marginTop: 6 }}>
                {value}
            </div>
        </div>
    )
    return href ? <Link href={href} style={{ textDecoration: "none" }}>{body}</Link> : body
}
