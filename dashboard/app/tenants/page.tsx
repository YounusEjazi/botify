import { api } from "@/lib/api"
import Link from "next/link"
import { Notice } from "@/components/ui"
import { Logo } from "@/components/Logo"

export default async function TenantsIndex({
    searchParams,
}: {
    searchParams: Promise<{ deleted?: string }>
}) {
    const [tenants, sp] = await Promise.all([api.listTenants(), searchParams])

    return (
        <div className="container" style={{ padding: "56px 32px 80px", maxWidth: 960 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, color: "var(--ink)" }}>
                <Logo size={28} />
                <span style={{ fontFamily: "var(--f-display)", fontSize: 22, letterSpacing: "-0.01em" }}>
                    Bot<em>-ify</em>
                </span>
            </div>
            <div className="eyebrow">Dashboard</div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
                <h1 className="h-display">Tenants</h1>
                <Link href="/tenants/new" className="btn primary">New tenant</Link>
            </div>
            <p className="subdued">Turn any business into a bot. Every deployment lives under a tenant — pick one to manage prompts, branding, knowledge, and integrations.</p>

            {sp.deleted && (
                <div style={{ marginTop: 16 }}>
                    <Notice kind="success">
                        Tenant <code>{sp.deleted}</code> deleted.
                    </Notice>
                </div>
            )}

            {tenants.length === 0 ? (
                <div className="card" style={{ marginTop: 24 }}>
                    <p className="subdued" style={{ margin: 0 }}>
                        No tenants yet. <Link href="/tenants/new">Create your first one</Link>.
                    </p>
                </div>
            ) : (
                <div style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                    gap: 16,
                    marginTop: 24,
                }}>
                    {tenants.map((t) => (
                        <Link key={t.id} href={`/tenants/${t.slug}`} style={{ textDecoration: "none" }}>
                            <div className="card" style={{ height: "100%" }}>
                                <div className="card-header">
                                    <h2 className="card-title">{t.name}</h2>
                                </div>
                                <div style={{ fontFamily: "var(--f-mono)", fontSize: 12, color: "var(--ink-mute)" }}>
                                    {t.slug}
                                </div>
                                <div className="subdued" style={{ marginTop: 12, fontSize: 13 }}>
                                    Languages: {t.languages.join(", ") || "—"}
                                </div>
                            </div>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    )
}
