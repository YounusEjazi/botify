"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Logo } from "./Logo"
import { LogoutButton } from "./LogoutButton"

const SECTIONS = [
    { href: "",                label: "Overview" },
    { href: "/llm",            label: "LLM" },
    { href: "/prompt",         label: "System prompt" },
    { href: "/branding",       label: "Branding" },
    { href: "/knowledge",      label: "Knowledge base" },
    { href: "/connectors",     label: "Connectors" },
    { href: "/retrieval",      label: "Retrieval" },
    { href: "/integrations",   label: "Integrations" },
    { href: "/conversations",  label: "Conversations" },
    { href: "/analytics",      label: "Analytics" },
    { href: "/danger",         label: "Danger zone" },
]

export function TenantSidebar({ slug, name }: { slug: string; name: string }) {
    const pathname = usePathname()
    const base = `/tenants/${slug}`

    return (
        <aside className="shell-rail">
            <Link href="/" className="rail-brand" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Logo size={22} />
                <span>Bot<em>-ify</em></span>
            </Link>
            <div className="rail-tag">Admin</div>

            <div className="rail-section">Tenant</div>
            <div style={{
                fontFamily: "var(--f-display)",
                fontSize: 20, lineHeight: 1.1,
                marginBottom: 4,
            }}>
                {name}
            </div>
            <div style={{ fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--ink-mute)", marginBottom: 18 }}>
                {slug}
            </div>

            <nav className="rail-nav">
                {SECTIONS.map(({ href, label }) => {
                    const full = base + href
                    const active = href === "" ? pathname === base : pathname.startsWith(full)
                    return (
                        <Link
                            key={href || "overview"}
                            href={full}
                            className={`rail-link ${active ? "active" : ""}`}
                        >
                            {label}
                        </Link>
                    )
                })}
            </nav>

            <div className="rail-section">Back</div>
            <Link href="/" className="rail-link">Home</Link>
            <Link href="/tenants" className="rail-link">All tenants</Link>

            <div className="rail-section">Account</div>
            <Link href="/account" className="rail-link">Profile & settings</Link>
            <LogoutButton />
        </aside>
    )
}
