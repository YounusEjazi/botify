"use client"

import { useState } from "react"
import { Field, Notice } from "@/components/ui"
import type { LLMConfig, LLMTestResult } from "@/lib/api"

type Provider = {
    id: string
    label: string
    models: string[]
    apiBase?: string
    apiKeyHint: string
    docsUrl: string
}

const PROVIDERS: Provider[] = [
    {
        id: "openai",
        label: "OpenAI",
        models: ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "gpt-4.1", "o4-mini"],
        apiKeyHint: "sk-… from platform.openai.com",
        docsUrl: "https://platform.openai.com/api-keys",
    },
    {
        id: "anthropic",
        label: "Anthropic",
        models: [
            "anthropic/claude-haiku-4-5",
            "anthropic/claude-sonnet-4-6",
            "anthropic/claude-opus-4-7",
        ],
        apiKeyHint: "sk-ant-… from console.anthropic.com",
        docsUrl: "https://console.anthropic.com/settings/keys",
    },
    {
        id: "deepseek",
        label: "DeepSeek",
        models: ["deepseek/deepseek-chat", "deepseek/deepseek-reasoner"],
        apiKeyHint: "sk-… from platform.deepseek.com",
        docsUrl: "https://platform.deepseek.com/api_keys",
    },
    {
        id: "gemini",
        label: "Google Gemini",
        models: ["gemini/gemini-2.5-flash", "gemini/gemini-2.5-pro"],
        apiKeyHint: "From aistudio.google.com",
        docsUrl: "https://aistudio.google.com/app/apikey",
    },
    {
        id: "groq",
        label: "Groq",
        models: ["groq/llama-3.3-70b-versatile", "groq/llama-3.1-8b-instant"],
        apiKeyHint: "From console.groq.com",
        docsUrl: "https://console.groq.com/keys",
    },
    {
        id: "custom",
        label: "Custom / OpenAI-compatible",
        models: [],
        apiKeyHint: "Any string accepted by the upstream API",
        docsUrl: "https://docs.litellm.ai/docs/providers",
    },
]

function providerOf(id: string): Provider {
    return PROVIDERS.find((p) => p.id === id) || PROVIDERS[0]
}

export function LLMConfigEditor({
    slug,
    initial,
}: {
    slug: string
    initial: LLMConfig
}) {
    const [providerId, setProviderId] = useState(initial.provider || "openai")
    const [model, setModel] = useState(initial.model || providerOf(initial.provider || "openai").models[0] || "")
    const [temperature, setTemperature] = useState(initial.temperature ?? 0)
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
        if (p.models.length && !p.models.includes(model)) {
            setModel(p.models[0])
        }
    }

    async function save(e: React.FormEvent) {
        e.preventDefault()
        setSaving(true)
        setError(null)
        setSavedAt(null)
        try {
            const body = {
                provider: providerId,
                model,
                temperature,
                api_base: apiBase,
                api_key: apiKey || null,
            }
            const resp = await fetch(`/api/proxy/tenants/${slug}/llm`, {
                method: "PUT",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(body),
            })
            if (!resp.ok) {
                throw new Error((await resp.json().catch(() => ({}))).detail || resp.statusText)
            }
            const next: LLMConfig = await resp.json()
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
            const resp = await fetch(`/api/proxy/tenants/${slug}/llm/test`, {
                method: "POST",
            })
            const data: LLMTestResult = await resp.json()
            setTestResult(data)
        } catch (e: any) {
            setTestResult({ ok: false, detail: e.message, model: "" })
        } finally {
            setTesting(false)
        }
    }

    async function clearKey() {
        if (!confirm("Remove the saved API key for this tenant? Chat will fail until you set a new one (or fall back to the env-var key).")) return
        const resp = await fetch(`/api/proxy/tenants/${slug}/llm/key`, { method: "DELETE" })
        if (resp.ok) setHasKey(false)
    }

    return (
        <form className="card" onSubmit={save} style={{ marginTop: 16 }}>
            {error && <Notice kind="error">{error}</Notice>}
            {savedAt && <Notice kind="success">Saved at {savedAt}.</Notice>}

            <Field label="Provider" hint="Get an API key from this provider, then paste it below.">
                <select
                    className="input"
                    value={providerId}
                    onChange={(e) => onPickProvider(e.target.value)}
                >
                    {PROVIDERS.map((p) => (
                        <option key={p.id} value={p.id}>{p.label}</option>
                    ))}
                </select>
                <div style={{ fontSize: 12, marginTop: 4 }}>
                    <a href={provider.docsUrl} target="_blank" rel="noreferrer">{provider.docsUrl}</a>
                </div>
            </Field>

            <Field label="Model" hint="LiteLLM model string. For custom providers, prefix with the provider name (e.g. openai/my-model).">
                {provider.models.length ? (
                    <input
                        className="input mono"
                        list={`models-${providerId}`}
                        value={model}
                        onChange={(e) => setModel(e.target.value)}
                        required
                    />
                ) : (
                    <input
                        className="input mono"
                        value={model}
                        onChange={(e) => setModel(e.target.value)}
                        placeholder="openai/my-model"
                        required
                    />
                )}
                {provider.models.length > 0 && (
                    <datalist id={`models-${providerId}`}>
                        {provider.models.map((m) => <option key={m} value={m} />)}
                    </datalist>
                )}
            </Field>

            <Field label="API key" hint={hasKey ? `A key is already stored. ${provider.apiKeyHint}. Leave blank to keep the existing key.` : provider.apiKeyHint}>
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

            <Field label="API base URL (optional)" hint="Required for Azure OpenAI or self-hosted OpenAI-compatible endpoints. Leave blank otherwise.">
                <input
                    className="input mono"
                    type="url"
                    placeholder="https://api.openai.com/v1"
                    value={apiBase}
                    onChange={(e) => setApiBase(e.target.value)}
                />
            </Field>

            <Field label={`Temperature: ${temperature.toFixed(2)}`} hint="0 = deterministic; higher = more creative. Keep at 0 for support bots.">
                <input
                    type="range"
                    min={0} max={2} step={0.05}
                    value={temperature}
                    onChange={(e) => setTemperature(parseFloat(e.target.value))}
                />
            </Field>

            <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginTop: 12, flexWrap: "wrap", gap: 8 }}>
                <button
                    type="button"
                    className="btn"
                    onClick={runTest}
                    disabled={testing}
                >
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
                            Connection OK on <code>{testResult.model}</code>.
                        </Notice>
                    ) : (
                        <Notice kind="error">
                            <strong>Failed.</strong> {testResult.detail}
                        </Notice>
                    )}
                </div>
            )}
        </form>
    )
}
