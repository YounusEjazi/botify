"use client"

import { useMemo, useState } from "react"
import { Field, Notice } from "@/components/ui"

type FieldRow = { id: string; key: string; value: string }

function uid() {
    return Math.random().toString(36).slice(2, 9)
}

export function SalesforceForm({
    slug,
    onSuccess,
    onCancel,
}: {
    slug: string
    onSuccess: () => void
    onCancel: () => void
}) {
    const [name, setName] = useState("Salesforce")
    const [instanceUrl, setInstanceUrl] = useState("")
    const [tokenUrl, setTokenUrl] = useState("")  // blank = auto-derive from instanceUrl
    const [apiVersion, setApiVersion] = useState("v61.0")
    const [caseOrigin, setCaseOrigin] = useState("")
    const [defaultStatus, setDefaultStatus] = useState("New")
    const [clientId, setClientId] = useState("")
    const [clientSecret, setClientSecret] = useState("")
    const [fields, setFields] = useState<FieldRow[]>([])

    const [saving, setSaving] = useState(false)
    const [testing, setTesting] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [testResult, setTestResult] = useState<{ ok: boolean; detail: string } | null>(null)

    const derivedTokenUrl = useMemo(
        () => (instanceUrl ? `${instanceUrl.replace(/\/+$/, "")}/services/oauth2/token` : ""),
        [instanceUrl],
    )

    function addField() {
        setFields((f) => [...f, { id: uid(), key: "", value: "" }])
    }

    function updateField(id: string, patch: Partial<FieldRow>) {
        setFields((f) => f.map((row) => (row.id === id ? { ...row, ...patch } : row)))
    }

    function removeField(id: string) {
        setFields((f) => f.filter((row) => row.id !== id))
    }

    function buildPayload() {
        const fieldMap: Record<string, string> = {}
        for (const row of fields) {
            const key = row.key.trim()
            if (key) fieldMap[key] = row.value
        }
        return {
            kind: "salesforce",
            name,
            enabled: true,
            config: {
                instance_url: instanceUrl,
                token_url: tokenUrl,
                api_version: apiVersion,
                case_origin: caseOrigin,
                default_status: defaultStatus,
                field_map: fieldMap,
            },
            secret: {
                client_id: clientId,
                client_secret: clientSecret,
            },
        }
    }

    async function runTest() {
        setTesting(true)
        setTestResult(null)
        setError(null)
        try {
            const resp = await fetch("/api/proxy/integrations/test/salesforce", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    instance_url: instanceUrl,
                    token_url: tokenUrl,
                    client_id: clientId,
                    client_secret: clientSecret,
                }),
            })
            const data = await resp.json()
            setTestResult({ ok: !!data.ok, detail: data.detail || "" })
        } catch (e: any) {
            setTestResult({ ok: false, detail: e.message })
        } finally {
            setTesting(false)
        }
    }

    async function save() {
        if (!instanceUrl) return setError("Instance URL is required.")
        if (!clientId || !clientSecret) return setError("Connected App client_id and client_secret are required.")

        setSaving(true)
        setError(null)
        try {
            const resp = await fetch(`/api/proxy/tenants/${slug}/integrations`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(buildPayload()),
            })
            if (!resp.ok) {
                const detail = await resp.json().catch(() => ({}))
                throw new Error(detail.detail || resp.statusText)
            }
            onSuccess()
        } catch (e: any) {
            setError(e.message)
        } finally {
            setSaving(false)
        }
    }

    return (
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--rule-soft)" }}>
            {error && <Notice kind="error">{error}</Notice>}

            <Field label="Name" hint="Internal label only.">
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>

            <Field label="Instance URL" hint="Your Salesforce org base URL.">
                <input
                    className="input mono"
                    type="url"
                    placeholder="https://acme.my.salesforce.com"
                    value={instanceUrl}
                    onChange={(e) => setInstanceUrl(e.target.value)}
                    required
                />
            </Field>

            <Field
                label="Token URL (optional)"
                hint={`Leave blank to auto-derive: ${derivedTokenUrl || "<instance>/services/oauth2/token"}`}
            >
                <input
                    className="input mono"
                    type="url"
                    placeholder={derivedTokenUrl || "https://acme.my.salesforce.com/services/oauth2/token"}
                    value={tokenUrl}
                    onChange={(e) => setTokenUrl(e.target.value)}
                />
            </Field>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Field label="API version" hint="e.g. v61.0">
                    <input
                        className="input mono"
                        value={apiVersion}
                        onChange={(e) => setApiVersion(e.target.value)}
                    />
                </Field>
                <Field label="Default Case status" hint="Whatever Status your org uses for new cases.">
                    <input
                        className="input"
                        value={defaultStatus}
                        onChange={(e) => setDefaultStatus(e.target.value)}
                    />
                </Field>
            </div>

            <Field label="Case Origin (optional)" hint="Salesforce field; pick a value your picklist accepts. Leave blank to omit.">
                <input
                    className="input"
                    placeholder="Chatbot"
                    value={caseOrigin}
                    onChange={(e) => setCaseOrigin(e.target.value)}
                />
            </Field>

            <Field label="Connected App — Client ID" hint="From Setup → App Manager → your Connected App.">
                <input
                    className="input mono"
                    type="password"
                    autoComplete="off"
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                />
            </Field>

            <Field label="Connected App — Client Secret" hint="Encrypted at rest. Never returned by the API.">
                <input
                    className="input mono"
                    type="password"
                    autoComplete="off"
                    value={clientSecret}
                    onChange={(e) => setClientSecret(e.target.value)}
                />
            </Field>

            <Field
                label="Custom Case fields (optional)"
                hint="API field name → value. Applied to every Case the bot creates. Use this for required custom fields in your org."
            >
                <div style={{ display: "grid", gap: 8 }}>
                    {fields.length === 0 && (
                        <div className="subdued" style={{ fontSize: 13 }}>
                            No custom fields. Click "Add field" if your Salesforce Case object requires any custom values.
                        </div>
                    )}
                    {fields.map((row) => (
                        <div key={row.id} style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8 }}>
                            <input
                                className="input mono"
                                placeholder="Custom_Field__c"
                                value={row.key}
                                onChange={(e) => updateField(row.id, { key: e.target.value })}
                            />
                            <input
                                className="input"
                                placeholder="value"
                                value={row.value}
                                onChange={(e) => updateField(row.id, { value: e.target.value })}
                            />
                            <button type="button" className="btn" onClick={() => removeField(row.id)} aria-label="Remove field">
                                ×
                            </button>
                        </div>
                    ))}
                    <div>
                        <button type="button" className="btn" onClick={addField}>
                            + Add field
                        </button>
                    </div>
                </div>
            </Field>

            <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginTop: 12, flexWrap: "wrap", gap: 8 }}>
                <button
                    type="button"
                    className="btn"
                    onClick={runTest}
                    disabled={testing || !instanceUrl || !clientId || !clientSecret}
                    title={!instanceUrl || !clientId || !clientSecret ? "Fill in instance URL + client ID + client secret first." : ""}
                >
                    {testing ? "Testing…" : "Test connection"}
                </button>
                <div className="row" style={{ gap: 8 }}>
                    <button type="button" className="btn" onClick={onCancel}>Cancel</button>
                    <button type="button" className="btn primary" onClick={save} disabled={saving}>
                        {saving ? "Saving…" : "Connect"}
                    </button>
                </div>
            </div>

            {testResult && (
                <div style={{ marginTop: 12 }}>
                    {testResult.ok ? (
                        <Notice kind="success">OAuth handshake succeeded. Credentials are valid.</Notice>
                    ) : (
                        <Notice kind="error">
                            <strong>Test failed.</strong> {testResult.detail}
                        </Notice>
                    )}
                </div>
            )}
        </div>
    )
}
