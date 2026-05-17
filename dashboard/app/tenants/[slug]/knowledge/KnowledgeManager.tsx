"use client"

import { useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { Document } from "@/lib/api"
import { Field, Notice, Empty } from "@/components/ui"

export function KnowledgeManager({ slug, initialDocs }: { slug: string; initialDocs: Document[] }) {
    const router = useRouter()
    const [docs, setDocs] = useState(initialDocs)
    const [url, setUrl] = useState("")
    const [title, setTitle] = useState("")
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)
    const fileRef = useRef<HTMLInputElement>(null)

    function flash(msg: string) {
        setSuccess(msg)
        setError(null)
        setTimeout(() => setSuccess(null), 3500)
    }

    async function refresh() {
        const resp = await fetch(`/api/proxy/tenants/${slug}/documents`)
        if (resp.ok) setDocs(await resp.json())
    }

    async function addFromUrl(e: React.FormEvent) {
        e.preventDefault()
        if (!url.trim()) return
        setBusy(true); setError(null)
        try {
            const resp = await fetch(`/api/proxy/tenants/${slug}/documents/from-url`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ url, title: title || undefined }),
            })
            if (!resp.ok) throw new Error((await resp.json()).detail || "Failed")
            setUrl(""); setTitle("")
            await refresh()
        } catch (e: any) {
            setError(e.message)
        } finally {
            setBusy(false)
        }
    }

    async function uploadFile(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (!file) return
        setBusy(true); setError(null)
        try {
            const fd = new FormData()
            fd.append("file", file)
            if (title) fd.append("title", title)
            const resp = await fetch(`/api/proxy/tenants/${slug}/documents/upload`, { method: "POST", body: fd })
            if (!resp.ok) throw new Error((await resp.text()) || "Upload failed")
            setTitle("")
            if (fileRef.current) fileRef.current.value = ""
            await refresh()
        } catch (e: any) {
            setError(e.message)
        } finally {
            setBusy(false)
        }
    }

    async function deleteDoc(id: string, title: string) {
        if (!confirm(`Delete "${title}" and its index?`)) return
        try {
            const resp = await fetch(`/api/proxy/documents/${id}`, { method: "DELETE" })
            if (!resp.ok && resp.status !== 204) {
                const detail = await resp.json().catch(() => ({}))
                throw new Error(detail.detail || resp.statusText)
            }
            await refresh()
            flash(`Deleted "${title}".`)
        } catch (e: any) {
            setError(`Delete failed: ${e.message}`)
        }
    }

    return (
        <div>
            {error && <Notice kind="error">{error}</Notice>}
            {success && <Notice kind="success">{success}</Notice>}

            <div className="card">
                <div className="card-header"><h2 className="card-title">Add documents</h2></div>

                <form onSubmit={addFromUrl}>
                    <Field label="From URL" hint="Crawls the page once and chunks the text. Re-add to refresh.">
                        <div className="row">
                            <input className="input mono grow" placeholder="https://docs.example.com/faq"
                                   value={url} onChange={(e) => setUrl(e.target.value)} />
                            <button className="btn primary" disabled={busy || !url}>Ingest URL</button>
                        </div>
                    </Field>
                </form>

                <div style={{ height: 1, background: "var(--rule-soft)", margin: "16px 0" }} />

                <Field label="Optional title (for both URL and file)" hint="Falls back to filename / URL if blank.">
                    <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
                </Field>

                <Field label="Or upload a file" hint="PDF, HTML, text, markdown. ~10MB per file works comfortably.">
                    <input ref={fileRef} type="file" onChange={uploadFile} disabled={busy}
                           accept=".pdf,.html,.htm,.txt,.md" />
                </Field>
            </div>

            <div className="card">
                <div className="card-header"><h2 className="card-title">Indexed documents</h2></div>
                {docs.length === 0
                    ? <Empty title="Nothing indexed yet" hint="Add a URL or upload a file above." />
                    : (
                        <table className="table">
                            <thead>
                                <tr><th>Title</th><th>Status</th><th>Chunks</th><th>Added</th><th></th></tr>
                            </thead>
                            <tbody>
                                {docs.map((d) => (
                                    <tr key={d.id}>
                                        <td>
                                            <div>{d.title}</div>
                                            {d.source_url && (
                                                <div style={{ fontSize: 11, color: "var(--ink-mute)", fontFamily: "var(--f-mono)" }}>{d.source_url}</div>
                                            )}
                                            {d.error_message && (
                                                <div style={{ fontSize: 11, color: "var(--negative)", marginTop: 4 }}>{d.error_message}</div>
                                            )}
                                        </td>
                                        <td><span className={`badge ${d.status}`}>{d.status}</span></td>
                                        <td style={{ fontFamily: "var(--f-mono)" }}>{d.chunk_count}</td>
                                        <td style={{ color: "var(--ink-mute)" }}>{new Date(d.created_at).toLocaleDateString()}</td>
                                        <td><button className="btn small danger" onClick={() => deleteDoc(d.id, d.title)}>Delete</button></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
            </div>
        </div>
    )
}
