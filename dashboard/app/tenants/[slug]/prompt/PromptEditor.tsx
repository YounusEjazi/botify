"use client"

import { useState } from "react"
import { Notice } from "@/components/ui"

export function PromptEditor({
    slug, languages, initial,
}: {
    slug: string
    languages: string[]
    initial: Record<string, string>
}) {
    const [prompts, setPrompts] = useState<Record<string, string>>(() => {
        const seed: Record<string, string> = {}
        for (const l of languages) seed[l] = initial[l] ?? ""
        return seed
    })
    const [active, setActive] = useState(languages[0] || "en")
    const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle")
    const [error, setError] = useState<string | null>(null)

    async function save() {
        setStatus("saving"); setError(null)
        try {
            const resp = await fetch(`/api/proxy/tenants/${slug}`, {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ system_prompts: prompts }),
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
                <div className="card-header">
                    <div className="row" style={{ gap: 4 }}>
                        {languages.map((l) => (
                            <button
                                key={l}
                                type="button"
                                className={`btn small ${active === l ? "primary" : ""}`}
                                onClick={() => setActive(l)}
                            >
                                {l.toUpperCase()}
                            </button>
                        ))}
                    </div>
                    <button className="btn primary" onClick={save} disabled={status === "saving"}>
                        {status === "saving" ? "Saving…" : "Save"}
                    </button>
                </div>

                <textarea
                    className="textarea mono"
                    style={{ minHeight: 420, lineHeight: 1.6 }}
                    value={prompts[active] || ""}
                    onChange={(e) => setPrompts({ ...prompts, [active]: e.target.value })}
                />
                <p className="field-hint">
                    Tip: tell the model to always call <code>search_knowledge_base</code> before answering
                    substantive questions, and <code>create_support_ticket</code> when it can't help.
                </p>
            </div>
        </div>
    )
}
