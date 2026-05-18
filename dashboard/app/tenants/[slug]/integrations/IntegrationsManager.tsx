"use client"

import { useState } from "react"
import { api, Integration } from "@/lib/api"
import { Field, Notice, Empty } from "@/components/ui"
import { SalesforceForm } from "./SalesforceForm"

const KINDS = [
    {
        kind: "salesforce",
        label: "Salesforce",
        configHint: "",
        configExample: {},
        secretExample: {},
    },
    {
        kind: "zendesk",
        label: "Zendesk",
        configHint: "subdomain, priority, tags, group_id (optional), ticket_form_id (optional).",
        configExample: {
            subdomain: "mycompany",
            priority: "normal",
            tags: ["chatbot"],
            group_id: null,
            ticket_form_id: null,
        },
        secretExample: { email: "admin@mycompany.com", api_token: "…" },
    },
    {
        kind: "webhook",
        label: "Webhook",
        configHint: "url, tool_name, tool_description, fields[].",
        configExample: {
            url: "https://acme.example.com/chatbot",
            tool_name: "create_ticket",
            tool_description: "File a support ticket in our system.",
            fields: [
                { name: "subject", type: "string", description: "Short summary", required: true },
                { name: "email",   type: "string", description: "User email",    required: false },
            ],
        },
        secretExample: { hmac_secret: "…", auth_header: "Bearer …" },
    },
    {
        kind: "email",
        label: "Email handoff",
        configHint: "SMTP details + recipient list.",
        configExample: {
            to_addresses: ["support@acme.com"],
            from_address: "bot@yours.com",
            smtp_host: "smtp.example.com",
            smtp_port: 587,
            smtp_use_tls: true,
            subject_prefix: "[Chatbot] ",
        },
        secretExample: { smtp_user: "…", smtp_password: "…" },
    },
    {
        kind: "mcp",
        label: "MCP server",
        configHint: "server_url (required), auth_header (optional, default: Authorization).",
        configExample: {
            server_url: "https://your-mcp-server.example.com/mcp",
            server_name: "My MCP Server",
            auth_header: "Authorization",
        },
        secretExample: { auth_token: "Bearer sk-…" },
    },
]

export function IntegrationsManager({ slug, initial }: { slug: string; initial: Integration[] }) {
    const [items, setItems] = useState(initial)
    const [adding, setAdding] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)

    async function refresh() {
        const resp = await fetch(`/api/proxy/tenants/${slug}/integrations`)
        if (resp.ok) setItems(await resp.json())
    }

    async function remove(id: string) {
        if (!confirm("Disconnect this integration?")) return
        const resp = await fetch(`/api/proxy/integrations/${id}`, { method: "DELETE" })
        if (resp.ok) await refresh()
        else setError("Failed to delete")
    }

    return (
        <div>
            {error && <Notice kind="error">{error}</Notice>}

            <div className="card">
                <div className="card-header"><h2 className="card-title">Connected</h2></div>
                {items.length === 0
                    ? <Empty title="Nothing connected yet" hint="Add one below to give the chatbot a tool." />
                    : (
                        <table className="table">
                            <thead><tr><th>Name</th><th>Kind</th><th>Status</th><th>Secret</th><th></th></tr></thead>
                            <tbody>
                                {items.map((i) => (
                                    <tr key={i.id}>
                                        <td><span style={{ fontWeight: 500 }}>{i.name}</span></td>
                                        <td style={{ fontFamily: "var(--f-mono)" }}>{i.kind}</td>
                                        <td><span className={`badge ${i.enabled ? "ready" : ""}`}>{i.enabled ? "enabled" : "disabled"}</span></td>
                                        <td>{i.has_secret ? <span className="badge ready">stored</span> : <span className="badge failed">missing</span>}</td>
                                        <td><button className="btn small danger" onClick={() => remove(i.id)}>Remove</button></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
            </div>

            <div className="card">
                <div className="card-header"><h2 className="card-title">Add an integration</h2></div>
                <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                    {KINDS.map((k) => (
                        <button
                            key={k.kind}
                            className={`btn ${adding === k.kind ? "primary" : ""}`}
                            onClick={() => setAdding(adding === k.kind ? null : k.kind)}
                            disabled={items.some(i => i.kind === k.kind)}
                        >
                            {k.label}
                        </button>
                    ))}
                </div>
                {adding === "salesforce" ? (
                    <SalesforceForm
                        slug={slug}
                        onSuccess={async () => { setAdding(null); await refresh() }}
                        onCancel={() => setAdding(null)}
                    />
                ) : adding === "mcp" ? (
                    <MCPForm
                        slug={slug}
                        onSuccess={async () => { setAdding(null); await refresh() }}
                        onCancel={() => setAdding(null)}
                    />
                ) : adding && (
                    <AddIntegrationForm
                        slug={slug}
                        spec={KINDS.find(k => k.kind === adding)!}
                        onSuccess={async () => { setAdding(null); await refresh() }}
                        onCancel={() => setAdding(null)}
                    />
                )}
            </div>
        </div>
    )
}

function AddIntegrationForm({
    slug, spec, onSuccess, onCancel,
}: {
    slug: string
    spec: typeof KINDS[number]
    onSuccess: () => void
    onCancel: () => void
}) {
    const [name, setName] = useState(spec.label)
    const [configJson, setConfigJson] = useState(JSON.stringify(spec.configExample, null, 2))
    const [secretJson, setSecretJson] = useState(JSON.stringify(spec.secretExample, null, 2))
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)

    async function save() {
        setBusy(true); setError(null)
        try {
            const config = JSON.parse(configJson)
            const secret = JSON.parse(secretJson)
            const resp = await fetch(`/api/proxy/tenants/${slug}/integrations`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ kind: spec.kind, name, config, secret, enabled: true }),
            })
            if (!resp.ok) throw new Error((await resp.json()).detail || "Failed")
            onSuccess()
        } catch (e: any) {
            setError(e.message || "Invalid JSON")
        } finally {
            setBusy(false)
        }
    }

    return (
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--rule-soft)" }}>
            {error && <Notice kind="error">{error}</Notice>}
            <Field label="Name" hint="Internal label. Customers don't see it.">
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Public config (JSON)" hint={spec.configHint}>
                <textarea className="textarea mono" rows={10} value={configJson} onChange={(e) => setConfigJson(e.target.value)} />
            </Field>
            <Field label="Secret (JSON, encrypted before storage)" hint="These never appear in any API response or log.">
                <textarea className="textarea mono" rows={6} value={secretJson} onChange={(e) => setSecretJson(e.target.value)} />
            </Field>
            <div className="row" style={{ justifyContent: "flex-end" }}>
                <button className="btn" onClick={onCancel}>Cancel</button>
                <button className="btn primary" onClick={save} disabled={busy}>
                    {busy ? "Saving…" : "Connect"}
                </button>
            </div>
        </div>
    )
}

function MCPForm({ slug, onSuccess, onCancel }: { slug: string; onSuccess: () => void; onCancel: () => void }) {
    const [name, setName] = useState("MCP Server")
    const [serverUrl, setServerUrl] = useState("")
    const [authHeader, setAuthHeader] = useState("Authorization")
    const [authToken, setAuthToken] = useState("")
    const [busy, setBusy] = useState(false)
    const [testing, setTesting] = useState(false)
    const [testResult, setTestResult] = useState<{ ok: boolean; detail: string; tools: string[] } | null>(null)
    const [error, setError] = useState<string | null>(null)

    async function test() {
        setTesting(true); setTestResult(null); setError(null)
        try {
            const result = await api.testMCP({ server_url: serverUrl, auth_token: authToken, auth_header: authHeader })
            setTestResult(result)
        } catch (e: any) {
            setError(e.message || "Test failed")
        } finally {
            setTesting(false)
        }
    }

    async function save() {
        setBusy(true); setError(null)
        try {
            const resp = await fetch(`/api/proxy/tenants/${slug}/integrations`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    kind: "mcp",
                    name,
                    config: { server_url: serverUrl, server_name: name, auth_header: authHeader },
                    secret: { auth_token: authToken },
                    enabled: true,
                }),
            })
            if (!resp.ok) throw new Error((await resp.json()).detail || "Failed")
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
            {testResult && (
                <Notice kind={testResult.ok ? "success" : "error"}>
                    {testResult.ok
                        ? `Connected — ${testResult.tools.length} tool${testResult.tools.length === 1 ? "" : "s"} found: ${testResult.tools.join(", ") || "none"}`
                        : testResult.detail}
                </Notice>
            )}

            <Field label="Name" hint="Internal label for this MCP server.">
                <input className="input" value={name} onChange={e => setName(e.target.value)} />
            </Field>
            <Field label="Server URL" hint="Full URL of the MCP endpoint, e.g. https://my-server.com/mcp">
                <input className="input" value={serverUrl} onChange={e => setServerUrl(e.target.value)} placeholder="https://…/mcp" />
            </Field>
            <Field label="Auth header" hint="HTTP header used for authentication (leave as Authorization for Bearer tokens).">
                <input className="input" value={authHeader} onChange={e => setAuthHeader(e.target.value)} />
            </Field>
            <Field label="Auth token" hint="Token value sent in the auth header. Encrypted before storage.">
                <input className="input" type="password" value={authToken} onChange={e => setAuthToken(e.target.value)} placeholder="Bearer sk-…" />
            </Field>

            <div className="row" style={{ justifyContent: "flex-end" }}>
                <button className="btn" onClick={onCancel}>Cancel</button>
                <button className="btn" onClick={test} disabled={testing || !serverUrl}>
                    {testing ? "Testing…" : "Test connection"}
                </button>
                <button className="btn primary" onClick={save} disabled={busy || !serverUrl}>
                    {busy ? "Saving…" : "Connect"}
                </button>
            </div>
        </div>
    )
}
