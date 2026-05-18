"use client"

import { useState } from "react"
import { api, Connector } from "@/lib/api"

const KIND_META: Record<string, { label: string; icon: string; configFields: ConfigField[]; secretFields: ConfigField[] }> = {
    notion: {
        label: "Notion",
        icon: "📝",
        configFields: [
            { key: "database_ids_str", label: "Database IDs", hint: "Comma-separated Notion database IDs", type: "text" },
            { key: "page_ids_str", label: "Page IDs (optional)", hint: "Comma-separated Notion page IDs", type: "text" },
        ],
        secretFields: [
            { key: "api_key", label: "Integration Token", hint: "secret_...", type: "password" },
        ],
    },
    gdrive: {
        label: "Google Drive",
        icon: "📂",
        configFields: [
            { key: "folder_ids_str", label: "Folder IDs", hint: "Comma-separated Google Drive folder IDs", type: "text" },
            { key: "file_ids_str", label: "File IDs (optional)", hint: "Comma-separated Google Drive file IDs", type: "text" },
        ],
        secretFields: [
            { key: "service_account_json", label: "Service Account JSON", hint: "Paste the full service account key JSON", type: "textarea" },
        ],
    },
}

interface ConfigField {
    key: string
    label: string
    hint: string
    type: "text" | "password" | "textarea"
}

const STATUS_COLOR: Record<string, string> = {
    idle: "var(--ink-mute)",
    syncing: "var(--c-brand)",
    ready: "#22c55e",
    error: "#ef4444",
}

function formatDate(dt: string | null | undefined) {
    if (!dt) return "Never"
    return new Date(dt).toLocaleString()
}

function parseIds(str: string): string[] {
    return str.split(",").map(s => s.trim()).filter(Boolean)
}

export function ConnectorsPage({ slug, initial }: { slug: string; initial: Connector[] }) {
    const [connectors, setConnectors] = useState(initial)
    const [adding, setAdding] = useState(false)
    const [syncing, setSyncing] = useState<Set<string>>(new Set())
    const [error, setError] = useState("")

    // Form state
    const [kind, setKind] = useState("notion")
    const [name, setName] = useState("")
    const [configVals, setConfigVals] = useState<Record<string, string>>({})
    const [secretVals, setSecretVals] = useState<Record<string, string>>({})
    const [saving, setSaving] = useState(false)

    const meta = KIND_META[kind]

    async function handleAdd(e: React.FormEvent) {
        e.preventDefault()
        setSaving(true)
        setError("")
        try {
            const config: Record<string, any> = {}
            const secret: Record<string, any> = {}
            for (const f of meta.configFields) {
                const raw = configVals[f.key] || ""
                if (f.key.endsWith("_str")) {
                    config[f.key.replace("_str", "s")] = parseIds(raw)
                } else {
                    config[f.key] = raw
                }
            }
            for (const f of meta.secretFields) {
                secret[f.key] = secretVals[f.key] || ""
            }
            const created = await api.createConnector(slug, { kind, name, config, secret })
            setConnectors(prev => [...prev, created])
            setAdding(false)
            setName("")
            setConfigVals({})
            setSecretVals({})
        } catch (err: any) {
            setError(err.message || "Failed to create connector")
        } finally {
            setSaving(false)
        }
    }

    async function handleDelete(id: string) {
        if (!confirm("Delete this connector?")) return
        await api.deleteConnector(id)
        setConnectors(prev => prev.filter(c => c.id !== id))
    }

    async function handleSync(id: string) {
        setSyncing(prev => new Set(prev).add(id))
        try {
            await api.syncConnector(id)
            setConnectors(prev =>
                prev.map(c => c.id === id ? { ...c, status: "syncing" } : c)
            )
        } finally {
            setSyncing(prev => { const s = new Set(prev); s.delete(id); return s })
        }
    }

    async function handleToggle(connector: Connector) {
        const updated = await api.updateConnector(connector.id, { enabled: !connector.enabled })
        setConnectors(prev => prev.map(c => c.id === connector.id ? updated : c))
    }

    return (
        <div>
            {connectors.length === 0 && !adding && (
                <div style={{
                    border: "1px dashed var(--border)",
                    borderRadius: 8,
                    padding: "32px 24px",
                    textAlign: "center",
                    color: "var(--ink-mute)",
                    marginBottom: 20,
                }}>
                    No connectors configured. Add one to auto-sync content.
                </div>
            )}

            {connectors.map(c => {
                const m = KIND_META[c.kind]
                return (
                    <div key={c.id} style={{
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        padding: "16px 20px",
                        marginBottom: 12,
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 16,
                    }}>
                        <span style={{ fontSize: 28, lineHeight: 1 }}>{m?.icon || "🔌"}</span>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600, fontSize: 15 }}>{c.name}</div>
                            <div style={{ color: "var(--ink-mute)", fontSize: 12, marginTop: 2 }}>
                                {m?.label || c.kind}
                                {" · "}
                                <span style={{ color: STATUS_COLOR[c.status] || "inherit" }}>
                                    {c.status}
                                </span>
                                {" · last synced: "}
                                {formatDate(c.last_synced_at)}
                            </div>
                            {c.error_message && (
                                <div style={{ color: "#ef4444", fontSize: 12, marginTop: 4 }}>
                                    {c.error_message}
                                </div>
                            )}
                        </div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <button
                                className="btn-sm"
                                disabled={syncing.has(c.id)}
                                onClick={() => handleSync(c.id)}
                            >
                                {syncing.has(c.id) ? "Syncing…" : "Sync now"}
                            </button>
                            <button
                                className="btn-sm"
                                onClick={() => handleToggle(c)}
                            >
                                {c.enabled ? "Disable" : "Enable"}
                            </button>
                            <button
                                className="btn-sm btn-danger"
                                onClick={() => handleDelete(c.id)}
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                )
            })}

            {adding ? (
                <form onSubmit={handleAdd} style={{
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    padding: "20px 24px",
                    marginTop: 12,
                }}>
                    <div style={{ fontWeight: 600, marginBottom: 16 }}>Add Connector</div>

                    <label style={{ display: "block", marginBottom: 12 }}>
                        <span className="field-label">Type</span>
                        <select
                            value={kind}
                            onChange={e => { setKind(e.target.value); setConfigVals({}); setSecretVals({}) }}
                            className="field-input"
                        >
                            <option value="notion">Notion</option>
                            <option value="gdrive">Google Drive</option>
                        </select>
                    </label>

                    <label style={{ display: "block", marginBottom: 12 }}>
                        <span className="field-label">Name</span>
                        <input
                            className="field-input"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder="e.g. Support Docs"
                            required
                        />
                    </label>

                    {meta.configFields.map(f => (
                        <label key={f.key} style={{ display: "block", marginBottom: 12 }}>
                            <span className="field-label">{f.label}</span>
                            <input
                                className="field-input"
                                type="text"
                                placeholder={f.hint}
                                value={configVals[f.key] || ""}
                                onChange={e => setConfigVals(prev => ({ ...prev, [f.key]: e.target.value }))}
                            />
                        </label>
                    ))}

                    {meta.secretFields.map(f => (
                        <label key={f.key} style={{ display: "block", marginBottom: 12 }}>
                            <span className="field-label">{f.label}</span>
                            {f.type === "textarea" ? (
                                <textarea
                                    className="field-input"
                                    rows={4}
                                    placeholder={f.hint}
                                    value={secretVals[f.key] || ""}
                                    onChange={e => setSecretVals(prev => ({ ...prev, [f.key]: e.target.value }))}
                                    style={{ resize: "vertical", fontFamily: "var(--f-mono)", fontSize: 12 }}
                                />
                            ) : (
                                <input
                                    className="field-input"
                                    type={f.type}
                                    placeholder={f.hint}
                                    value={secretVals[f.key] || ""}
                                    onChange={e => setSecretVals(prev => ({ ...prev, [f.key]: e.target.value }))}
                                />
                            )}
                        </label>
                    ))}

                    {error && <div style={{ color: "#ef4444", fontSize: 13, marginBottom: 12 }}>{error}</div>}

                    <div style={{ display: "flex", gap: 8 }}>
                        <button type="submit" className="btn-primary" disabled={saving}>
                            {saving ? "Saving…" : "Add connector"}
                        </button>
                        <button type="button" className="btn-sm" onClick={() => setAdding(false)}>
                            Cancel
                        </button>
                    </div>
                </form>
            ) : (
                <button
                    className="btn-primary"
                    style={{ marginTop: 8 }}
                    onClick={() => setAdding(true)}
                >
                    + Add connector
                </button>
            )}
        </div>
    )
}
