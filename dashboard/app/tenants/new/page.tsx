"use client"

import { useRouter } from "next/navigation"
import Link from "next/link"
import { useState } from "react"
import { Field, Notice } from "@/components/ui"

export default function NewTenantPage() {
    const router = useRouter()
    const [slug, setSlug] = useState("")
    const [name, setName] = useState("")
    const [origin, setOrigin] = useState("")
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)

    async function submit(e: React.FormEvent) {
        e.preventDefault()
        setSubmitting(true)
        setError(null)
        try {
            const resp = await fetch("/api/proxy/tenants", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    slug, name,
                    allowed_origins: origin ? [origin] : [],
                    branding: { primary_color: "#1a1a1a", display_name: name },
                    languages: ["en"],
                    default_language: "en",
                    system_prompts: { en: `You are a friendly support assistant for ${name}. Use the knowledge base before answering substantive questions.` },
                    ui_strings: { en: { greeting: `Hi! Ask me anything about ${name}.`, placeholder: "Ask a question…" } },
                    guardrails_enabled: true,
                }),
            })
            if (!resp.ok) throw new Error((await resp.json()).detail || "Failed to create")
            router.push(`/tenants/${slug}`)
        } catch (e: any) {
            setError(e.message)
            setSubmitting(false)
        }
    }

    return (
        <div className="container" style={{ padding: "56px 32px 80px", maxWidth: 720 }}>
            <div className="eyebrow"><Link href="/">All tenants</Link> / new</div>
            <h1 className="h-display">New <em>tenant</em></h1>
            <p className="subdued">Create the row. You'll fine-tune prompts, branding, and integrations after.</p>

            {error && <Notice kind="error">{error}</Notice>}

            <form className="card" onSubmit={submit}>
                <Field label="Name" hint="Shown in the widget header. Customers see this.">
                    <input className="input" required value={name} onChange={(e) => setName(e.target.value)} />
                </Field>
                <Field label="Slug" hint="Lowercase, dashes only. Goes into the embed snippet's data-tenant attribute.">
                    <input
                        className="input mono"
                        required pattern="[a-z0-9-]+"
                        value={slug}
                        onChange={(e) => setSlug(e.target.value.toLowerCase())}
                    />
                </Field>
                <Field label="Initial allowed origin" hint="e.g. https://www.acme.com. Add more later. Leave blank to configure after creation.">
                    <input
                        className="input mono"
                        type="url"
                        placeholder="https://www.acme.com"
                        value={origin}
                        onChange={(e) => setOrigin(e.target.value)}
                    />
                </Field>

                <div className="row" style={{ justifyContent: "flex-end", marginTop: 8 }}>
                    <Link href="/" className="btn">Cancel</Link>
                    <button className="btn primary" disabled={submitting}>
                        {submitting ? "Creating…" : "Create tenant"}
                    </button>
                </div>
            </form>
        </div>
    )
}
