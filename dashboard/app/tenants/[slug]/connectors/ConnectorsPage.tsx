"use client"

import { useState } from "react"
import { api, Connector } from "@/lib/api"
import { Field, Notice, Empty } from "@/components/ui"

interface ConfigField {
    key: string
    label: string
    hint: string
    type: "text" | "password" | "textarea"
}

const KIND_META: Record<string, {
    label: string
    configFields: ConfigField[]
    secretFields: ConfigField[]
}> = {
    notion: {
        label: "Notion",
        configFields: [
            { key: "database_ids_str", label: "Database IDs", hint: "Comma-separated Notion database IDs", type: "text" },
            { key: "page_ids_str",     label: "Page IDs (optional)", hint: "Comma-separated standalone page IDs", type: "text" },
        ],
        secretFields: [
            { key: "api_key", label: "Integration token", hint: "Starts with secret_…", type: "password" },
        ],
    },
    gdrive: {
        label: "Google Drive",
        configFields: [
            { key: "folder_ids_str", label: "Folder IDs", hint: "Comma-separated Google Drive folder IDs", type: "text" },
            { key: "file_ids_str",   label: "File IDs (optional)", hint: "Comma-separated file IDs", type: "text" },
        ],
        secretFields: [
            { key: "service_account_json", label: "Service account JSON", hint: "Paste the full JSON key file contents", type: "textarea" },
        ],
    },
}

const STATUS_BADGE: Record<string, string> = {
    idle:    "",
    syncing: "pending",
    ready:   "ready",
    error:   "failed",
}

function parseIds(str: string): string[] {
    return str.split(",").map(s => s.trim()).filter(Boolean)
}

function formatDate(dt: string | null | undefined) {
    if (!dt) return "Never"
    return new Date(dt).toLocaleString()
}

export function ConnectorsPage({ slug, initial }: { slug: string; initial: Connector[] }) {
    const [connectors, setConnectors] = useState(initial)
    const [adding, setAdding] = useState<string | null>(null)
    const [syncing, setSyncing] = useState<Set<string>>(new Set())
    const [error, setError] = useState<string | null>(null)

    async function refresh() {
        const fresh = await api.listConnectors(slug)
        setConnectors(fresh)
    }

    async function remove(id: string) {
        if (!confirm("Delete this connector and stop syncing?")) return
        try {
            await api.deleteConnector(id)
            setConnectors(prev => prev.filter(c => c.id !== id))
        } catch (e: any) {
            setError(e.message || "Failed to delete")
        }
    }

    async function triggerSync(id: string) {
        setSyncing(prev => new Set(prev).add(id))
        try {
            await api.syncConnector(id)
            setConnectors(prev => prev.map(c => c.id === id ? { ...c, status: "syncing" } : c))
        } catch (e: any) {
            setError(e.message || "Sync failed")
        } finally {
            setSyncing(prev => { const s = new Set(prev); s.delete(id); return s })
        }
    }

    async function toggle(c: Connector) {
        try {
            const updated = await api.updateConnector(c.id, { enabled: !c.enabled })
            setConnectors(prev => prev.map(x => x.id === c.id ? updated : x))
        } catch (e: any) {
            setError(e.message || "Update failed")
        }
    }

    return (
        <div>
            {error && <Notice kind="error">{error}</Notice>}

            <div className="card">
                <div className="card-header"><h2 className="card-title">Connected sources</h2></div>
                {connectors.length === 0
                    ? <Empty title="No connectors yet" hint="Add one below to auto-sync content into the knowledge base." />
                    : (
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Type</th>
                                    <th>Status</th>
                                    <th>Last synced</th>
                                    <th>Secret</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {connectors.map(c => (
                                    <tr key={c.id}>
                                        <td><span style={{ fontWeight: 500 }}>{c.name}</span>
                                            {c.error_message && (
                                                <div style={{ fontSize: 11, color: "var(--c-error, #ef4444)", marginTop: 2 }}>
                                                    {c.error_message}
                                                </div>
                                            )}
                                        </td>
                                        <td style={{ fontFamily: "var(--f-mono)" }}>{KIND_META[c.kind]?.label ?? c.kind}</td>
                                        <td><span className={`badge ${STATUS_BADGE[c.status] ?? ""}`}>{c.status}</span></td>
                                        <td style={{ fontSize: 12, color: "var(--ink-mute)" }}>{formatDate(c.last_synced_at)}</td>
                                        <td>{c.has_secret
                                            ? <span className="badge ready">stored</span>
                                            : <span className="badge failed">missing</span>}
                                        </td>
                                        <td>
                                            <div className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
                                                <button
                                                    className="btn small"
                                                    disabled={syncing.has(c.id)}
                                                    onClick={() => triggerSync(c.id)}
                                                >
                                                    {syncing.has(c.id) ? "Syncing…" : "Sync now"}
                                                </button>
                                                <button className="btn small" onClick={() => toggle(c)}>
                                                    {c.enabled ? "Disable" : "Enable"}
                                                </button>
                                                <button className="btn small danger" onClick={() => remove(c.id)}>
                                                    Remove
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )
                }
            </div>

            <div className="card">
                <div className="card-header"><h2 className="card-title">Add a connector</h2></div>
                <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                    {Object.entries(KIND_META).map(([kind, meta]) => (
                        <button
                            key={kind}
                            className={`btn ${adding === kind ? "primary" : ""}`}
                            onClick={() => setAdding(adding === kind ? null : kind)}
                        >
                            {meta.label}
                        </button>
                    ))}
                </div>
                {adding && (
                    <AddConnectorForm
                        slug={slug}
                        kind={adding}
                        meta={KIND_META[adding]}
                        onSuccess={async () => { setAdding(null); await refresh() }}
                        onCancel={() => setAdding(null)}
                    />
                )}
            </div>
        </div>
    )
}

function AddConnectorForm({
    slug, kind, meta, onSuccess, onCancel,
}: {
    slug: string
    kind: string
    meta: typeof KIND_META[string]
    onSuccess: () => void
    onCancel: () => void
}) {
    const [name, setName] = useState(meta.label)
    const [configVals, setConfigVals] = useState<Record<string, string>>({})
    const [secretVals, setSecretVals] = useState<Record<string, string>>({})
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)

    async function save() {
        setBusy(true); setError(null)
        try {
            const config: Record<string, any> = {}
            const secret: Record<string, any> = {}
            for (const f of meta.configFields) {
                const raw = configVals[f.key] || ""
                config[f.key.endsWith("_str") ? f.key.replace("_str", "s") : f.key] = f.key.endsWith("_str") ? parseIds(raw) : raw
            }
            for (const f of meta.secretFields) {
                secret[f.key] = secretVals[f.key] || ""
            }
            await api.createConnector(slug, { kind, name, config, secret, enabled: true })
            onSuccess()
        } catch (e: any) {
            setError(e.message || "Failed to save")
        } finally {
            setBusy(false)
        }
    }

    return (
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--rule-soft)" }}>
            {error && <Notice kind="error">{error}</Notice>}

            <Field label="Name" hint="Internal label — not shown to users.">
                <input className="input" value={name} onChange={e => setName(e.target.value)} />
            </Field>

            {meta.configFields.map(f => (
                <Field key={f.key} label={f.label} hint={f.hint}>
                    <input
                        className="input"
                        type="text"
                        value={configVals[f.key] || ""}
                        onChange={e => setConfigVals(prev => ({ ...prev, [f.key]: e.target.value }))}
                    />
                </Field>
            ))}

            {meta.secretFields.map(f => (
                <Field key={f.key} label={f.label} hint={`${f.hint} — encrypted before storage, never returned by the API.`}>
                    {f.type === "textarea"
                        ? <textarea
                            className="textarea mono"
                            rows={6}
                            value={secretVals[f.key] || ""}
                            onChange={e => setSecretVals(prev => ({ ...prev, [f.key]: e.target.value }))}
                          />
                        : <input
                            className="input"
                            type="password"
                            value={secretVals[f.key] || ""}
                            onChange={e => setSecretVals(prev => ({ ...prev, [f.key]: e.target.value }))}
                          />
                    }
                </Field>
            ))}

            <div className="row" style={{ justifyContent: "flex-end" }}>
                <button className="btn" onClick={onCancel}>Cancel</button>
                <button className="btn primary" onClick={save} disabled={busy}>
                    {busy ? "Saving…" : "Add connector"}
                </button>
            </div>
        </div>
    )
}
