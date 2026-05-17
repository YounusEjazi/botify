"use client"

import { useState } from "react"
import { Tenant } from "@/lib/api"
import { Field, Notice } from "@/components/ui"

export function BrandingEditor({ slug, tenant }: { slug: string; tenant: Tenant }) {
    const [primary, setPrimary] = useState(tenant.branding?.primary_color || "#1a1a1a")
    const [logoUrl, setLogoUrl] = useState(tenant.branding?.logo_url || "")
    const [displayName, setDisplayName] = useState(tenant.branding?.display_name || tenant.name)
    const [languages, setLanguages] = useState(tenant.languages.join(","))
    const [strings, setStrings] = useState<Record<string, Record<string, string>>>(tenant.ui_strings || {})
    const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle")
    const [error, setError] = useState<string | null>(null)

    const langList = languages.split(",").map(s => s.trim().toLowerCase()).filter(Boolean)

    function updateString(lang: string, key: string, value: string) {
        setStrings({ ...strings, [lang]: { ...(strings[lang] || {}), [key]: value } })
    }

    async function save() {
        setStatus("saving"); setError(null)
        try {
            const resp = await fetch(`/api/proxy/tenants/${slug}`, {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    branding: { primary_color: primary, logo_url: logoUrl, display_name: displayName },
                    languages: langList,
                    ui_strings: strings,
                }),
            })
            if (!resp.ok) throw new Error((await resp.json()).detail || "Save failed")
            setStatus("saved")
            setTimeout(() => setStatus("idle"), 2000)
        } catch (e: any) {
            setStatus("error"); setError(e.message)
        }
    }

    return (
        <div>
            {error && <Notice kind="error">{error}</Notice>}
            {status === "saved" && <Notice kind="success">Saved.</Notice>}

            <div className="card">
                <div className="card-header"><h2 className="card-title">Look</h2></div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                    <Field label="Primary color" hint="Used for the launcher and header.">
                        <div className="row">
                            <input type="color" value={primary} onChange={(e) => setPrimary(e.target.value)}
                                   style={{ width: 44, height: 38, border: "1px solid var(--rule)", padding: 0 }} />
                            <input className="input mono grow" value={primary} onChange={(e) => setPrimary(e.target.value)} />
                        </div>
                    </Field>
                    <Field label="Display name" hint="Title shown in widget header.">
                        <input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
                    </Field>
                </div>
                <Field label="Logo URL" hint="Optional. Square, transparent PNG/SVG works best.">
                    <input className="input mono" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://…" />
                </Field>
            </div>

            <div className="card">
                <div className="card-header">
                    <h2 className="card-title">Languages & strings</h2>
                </div>
                <Field label="Supported languages" hint="ISO 639-1 codes, comma-separated. First is the default.">
                    <input className="input mono" value={languages} onChange={(e) => setLanguages(e.target.value)} placeholder="en,de" />
                </Field>

                {langList.map((lang) => (
                    <div key={lang} style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--rule-soft)" }}>
                        <div style={{ fontFamily: "var(--f-mono)", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ink-mute)", marginBottom: 8 }}>
                            {lang}
                        </div>
                        <Field label="Greeting">
                            <input className="input" value={strings[lang]?.greeting || ""} onChange={(e) => updateString(lang, "greeting", e.target.value)} />
                        </Field>
                        <Field label="Input placeholder">
                            <input className="input" value={strings[lang]?.placeholder || ""} onChange={(e) => updateString(lang, "placeholder", e.target.value)} />
                        </Field>
                        <Field label="Header title">
                            <input className="input" value={strings[lang]?.title || ""} onChange={(e) => updateString(lang, "title", e.target.value)} />
                        </Field>
                    </div>
                ))}
            </div>

            <div className="row" style={{ justifyContent: "flex-end", marginTop: 16 }}>
                <button className="btn primary" onClick={save} disabled={status === "saving"}>
                    {status === "saving" ? "Saving…" : "Save changes"}
                </button>
            </div>
        </div>
    )
}
