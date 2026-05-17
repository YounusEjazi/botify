"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { Notice } from "@/components/ui"

type Action = {
    id: string
    title: string
    description: string
    cta: string
    method: "DELETE"
    path: string                // proxy path under /api/proxy/
    redirectTo?: string         // navigate here on success
    requireConfirm: boolean     // require typing the slug
    disabled?: boolean
    disabledReason?: string
}

export function DangerZone({
    slug,
    tenantName,
    hasApiKey,
    documentCount,
    conversationCount,
}: {
    slug: string
    tenantName: string
    hasApiKey: boolean
    documentCount: number
    conversationCount: number
}) {
    const router = useRouter()
    const [busyId, setBusyId] = useState<string | null>(null)
    const [doneMsg, setDoneMsg] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [confirmText, setConfirmText] = useState<Record<string, string>>({})

    const actions: Action[] = [
        {
            id: "llm-key",
            title: "Remove stored LLM API key",
            description: hasApiKey
                ? "Deletes the encrypted API key. Chat will fall back to the OPENAI_API_KEY env var (or fail) until you set a new key."
                : "No key currently stored.",
            cta: "Remove key",
            method: "DELETE",
            path: `tenants/${slug}/llm/key`,
            requireConfirm: false,
            disabled: !hasApiKey,
            disabledReason: "No key to remove.",
        },
        {
            id: "wipe-conversations",
            title: "Delete all conversations",
            description: `Removes all ${conversationCount} conversation${conversationCount === 1 ? "" : "s"} and their messages. The tenant, prompts, and knowledge base are kept.`,
            cta: `Delete ${conversationCount} conversation${conversationCount === 1 ? "" : "s"}`,
            method: "DELETE",
            path: `tenants/${slug}/conversations`,
            requireConfirm: true,
            disabled: conversationCount === 0,
            disabledReason: "No conversations to delete.",
        },
        {
            id: "wipe-documents",
            title: "Delete entire knowledge base",
            description: `Removes all ${documentCount} document${documentCount === 1 ? "" : "s"} and indexed chunks. You'll need to re-upload everything.`,
            cta: `Delete ${documentCount} document${documentCount === 1 ? "" : "s"}`,
            method: "DELETE",
            path: `tenants/${slug}/documents`,
            requireConfirm: true,
            disabled: documentCount === 0,
            disabledReason: "No documents to delete.",
        },
        {
            id: "delete-tenant",
            title: `Delete tenant "${tenantName}"`,
            description: "Permanently removes the tenant and everything under it: prompts, branding, integrations, documents, chunks, conversations, the encrypted LLM key, and the widget API key.",
            cta: "Delete tenant",
            method: "DELETE",
            path: `tenants/${slug}`,
            redirectTo: "/",
            requireConfirm: true,
        },
    ]

    async function run(action: Action) {
        if (action.disabled) return
        if (action.requireConfirm && confirmText[action.id] !== slug) {
            setError(`Type "${slug}" exactly to confirm.`)
            return
        }
        setError(null)
        setDoneMsg(null)
        setBusyId(action.id)
        try {
            const resp = await fetch(`/api/proxy/${action.path}`, { method: action.method })
            if (!resp.ok && resp.status !== 204) {
                const detail = await resp.json().catch(() => ({}))
                throw new Error(detail.detail || resp.statusText)
            }
            if (action.redirectTo) {
                const url = new URL(action.redirectTo, window.location.origin)
                url.searchParams.set("deleted", slug)
                router.push(url.pathname + url.search)
                router.refresh()
                return
            }
            setDoneMsg(`${action.title}: done.`)
            setConfirmText({ ...confirmText, [action.id]: "" })
            router.refresh()
        } catch (e: any) {
            setError(`${action.title} failed: ${e.message}`)
        } finally {
            setBusyId(null)
        }
    }

    return (
        <div style={{ marginTop: 16 }}>
            {error && <Notice kind="error">{error}</Notice>}
            {doneMsg && <Notice kind="success">{doneMsg}</Notice>}

            <div style={{ display: "grid", gap: 16 }}>
                {actions.map((a) => (
                    <div
                        key={a.id}
                        className="card"
                        style={{
                            borderColor: a.disabled ? undefined : "rgba(200,40,40,0.35)",
                            opacity: a.disabled ? 0.55 : 1,
                        }}
                    >
                        <div className="card-header">
                            <h2 className="card-title" style={{ color: a.disabled ? undefined : "#b22222" }}>
                                {a.title}
                            </h2>
                        </div>
                        <p className="subdued" style={{ marginTop: 0 }}>
                            {a.description}
                        </p>

                        {a.requireConfirm && !a.disabled && (
                            <div style={{ marginBottom: 12 }}>
                                <label className="field-label">
                                    Type <code>{slug}</code> to confirm
                                </label>
                                <input
                                    className="input mono"
                                    autoComplete="off"
                                    value={confirmText[a.id] || ""}
                                    onChange={(e) =>
                                        setConfirmText({ ...confirmText, [a.id]: e.target.value })
                                    }
                                    placeholder={slug}
                                />
                            </div>
                        )}

                        <div className="row" style={{ justifyContent: "flex-end" }}>
                            <button
                                type="button"
                                className="btn"
                                style={{
                                    borderColor: "rgba(178,34,34,0.55)",
                                    color: a.disabled ? undefined : "#b22222",
                                }}
                                disabled={
                                    a.disabled ||
                                    busyId !== null ||
                                    (a.requireConfirm && confirmText[a.id] !== slug)
                                }
                                onClick={() => run(a)}
                                title={a.disabled ? a.disabledReason : ""}
                            >
                                {busyId === a.id ? "Working…" : a.cta}
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
