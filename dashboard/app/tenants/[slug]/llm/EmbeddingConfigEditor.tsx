"use client"

import { useState } from "react"
import { Field, Notice } from "@/components/ui"
import type { EmbeddingConfig, LLMTestResult } from "@/lib/api"

type Provider = {
    id: string
    label: string
    models: string[]
    apiKeyHint: string
    docsUrl: string
}

// Only providers that actually offer embeddings. DeepSeek / Anthropic don't.
const PROVIDERS: Provider[] = [
    {
        id: "openai",
        label: "OpenAI",
        models: ["text-embedding-3-small", "text-embedding-3-large", "text-embedding-ada-002"],
        apiKeyHint: "sk-… from platform.openai.com",
        docsUrl: "https://platform.openai.com/api-keys",
    },
    {
        id: "voyage",
        label: "Voyage AI",
        models: ["voyage/voyage-3", "voyage/voyage-3-lite", "voyage/voyage-code-3"],
        apiKeyHint: "From dash.voyageai.com",
        docsUrl: "https://dash.voyageai.com/api-keys",
    },
    {
        id: "cohere",
        label: "Cohere",
        models: ["cohere/embed-english-v3.0", "cohere/embed-multilingual-v3.0"],
        apiKeyHint: "From dashboard.cohere.com",
        docsUrl: "https://dashboard.cohere.com/api-keys",
    },
    {
        id: "gemini",
        label: "Google Gemini",
        models: ["gemini/text-embedding-004"],
        apiKeyHint: "From aistudio.google.com",
        docsUrl: "https://aistudio.google.com/app/apikey",
    },
    {
        id: "custom",
        label: "Custom / OpenAI-compatible",
        models: [],
        apiKeyHint: "Any string accepted by the upstream API",
        docsUrl: "https://docs.litellm.ai/docs/embedding/supported_embedding",
    },
]

function providerOf(id: string): Provider {
    return PROVIDERS.find((p) => p.id === id) || PROVIDERS[0]
}

export function EmbeddingConfigEditor({
    slug,
    initial,
}: {
    slug: string
    initial: EmbeddingConfig
}) {
    const [providerId, setProviderId] = useState(initial.provider || "openai")
    const [model, setModel] = useState(initial.model || providerOf(initial.provider || "openai").models[0] || "")
    const [apiBase, setApiBase] = useState(initial.api_base || "")
    const [apiKey, setApiKey] = useState("")
    const [hasKey, setHasKey] = useState(initial.has_api_key)

    const [saving, setSaving] = useState(false)
    const [savedAt, setSavedAt] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [testing, setTesting] = useState(false)
    const [testResult, setTestResult] = useState<LLMTestResult | null>(null)

    const provider = providerOf(providerId)

    function onPickProvider(id: string) {
        setProviderId(id)
        const p = providerOf(id)
        if (p.models.length && !p.models.includes(model)) setModel(p.models[0])
    }

    async function save(e: React.FormEvent) {
        e.preventDefault()
        setSaving(true)
        setError(null)
        setSavedAt(null)
        try {
            const body = { provider: providerId, model, api_base: apiBase, api_key: apiKey || null }
            const resp = await fetch(`/api/proxy/tenants/${slug}/embedding`, {
                method: "PUT",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(body),
            })
            if (!resp.ok) throw new Error((await resp.json().catch(() => ({}))).detail || resp.statusText)
            const next: EmbeddingConfig = await resp.json()
            setHasKey(next.has_api_key)
            setApiKey("")
            setSavedAt(new Date().toLocaleTimeString())
        } catch (e: any) {
            setError(e.message)
        } finally {
            setSaving(false)
        }
    }

    async function runTest() {
        setTesting(true)
        setTestResult(null)
        try {
            const resp = await fetch(`/api/proxy/tenants/${slug}/embedding/test`, { method: "POST" })
            const data: LLMTestResult = await resp.json()
            setTestResult(data)
        } catch (e: any) {
            setTestResult({ ok: false, detail: e.message, model: "" })
        } finally {
            setTesting(false)
        }
    }

    async function clearKey() {
        if (!confirm("Remove the saved embedding API key? Indexing and search will fail until you set a new one.")) return
        const resp = await fetch(`/api/proxy/tenants/${slug}/embedding/key`, { method: "DELETE" })
        if (resp.ok) setHasKey(false)
    }

    return (
        <form className="card" onSubmit={save} style={{ marginTop: 16 }}>
            <div className="card-header">
                <h2 className="card-title">Embedding (RAG) provider</h2>
                <span className="badge">used by the knowledge base</span>
            </div>
            <p className="subdued" style={{ marginTop: 0 }}>
                Used to embed uploaded documents and incoming search queries. Often a different
                provider than chat — e.g. DeepSeek for chat + OpenAI embeddings.
            </p>

            {error && <Notice kind="error">{error}</Notice>}
            {savedAt && <Notice kind="success">Saved at {savedAt}.</Notice>}

            <Field label="Provider" hint="Get an embeddings API key from this provider.">
                <select className="input" value={providerId} onChange={(e) => onPickProvider(e.target.value)}>
                    {PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
                <div style={{ fontSize: 12, marginTop: 4 }}>
                    <a href={provider.docsUrl} target="_blank" rel="noreferrer">{provider.docsUrl}</a>
                </div>
            </Field>

            <Field label="Model" hint="LiteLLM embedding model string.">
                {provider.models.length ? (
                    <input
                        className="input mono"
                        list={`emb-models-${providerId}`}
                        value={model}
                        onChange={(e) => setModel(e.target.value)}
                        required
                    />
                ) : (
                    <input
                        className="input mono"
                        value={model}
                        onChange={(e) => setModel(e.target.value)}
                        placeholder="openai/text-embedding-3-small"
                        required
                    />
                )}
                {provider.models.length > 0 && (
                    <datalist id={`emb-models-${providerId}`}>
                        {provider.models.map((m) => <option key={m} value={m} />)}
                    </datalist>
                )}
            </Field>

            <Field
                label="API key"
                hint={hasKey ? `A key is already stored. ${provider.apiKeyHint}. Leave blank to keep it.` : provider.apiKeyHint}
            >
                <input
                    className="input mono"
                    type="password"
                    autoComplete="off"
                    placeholder={hasKey ? "•••••••••• (stored)" : "Paste a key to save"}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                />
                {hasKey && (
                    <button type="button" className="btn" onClick={clearKey} style={{ marginTop: 6 }}>
                        Remove stored key
                    </button>
                )}
            </Field>

            <Field
                label="API base URL (optional)"
                hint="For Azure or self-hosted OpenAI-compatible endpoints."
            >
                <input
                    className="input mono"
                    type="url"
                    placeholder="https://api.openai.com/v1"
                    value={apiBase}
                    onChange={(e) => setApiBase(e.target.value)}
                />
            </Field>

            <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginTop: 12, flexWrap: "wrap", gap: 8 }}>
                <button type="button" className="btn" onClick={runTest} disabled={testing}>
                    {testing ? "Testing…" : "Test connection"}
                </button>
                <button className="btn primary" disabled={saving}>
                    {saving ? "Saving…" : "Save"}
                </button>
            </div>

            {testResult && (
                <div style={{ marginTop: 12 }}>
                    {testResult.ok ? (
                        <Notice kind="success">
                            Embedding OK on <code>{testResult.model}</code>.
                        </Notice>
                    ) : (
                        <Notice kind="error">
                            <strong>Failed.</strong> {testResult.detail}
                        </Notice>
                    )}
                </div>
            )}

            <p className="subdued" style={{ fontSize: 12, marginTop: 16 }}>
                <strong>Heads up:</strong> changing the embedding model invalidates existing
                vectors (different dimensionality / semantic space). Wipe the knowledge base
                from the Danger zone and re-upload after switching models.
            </p>
        </form>
    )
}
