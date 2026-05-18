"use client"

import { useState } from "react"
import { Field, Notice } from "@/components/ui"
import type { LLMConfig, LLMTestResult } from "@/lib/api"

type Provider = {
    id: string
    label: string
    models: string[]
    modelHint?: string
    apiBaseRequired?: boolean
    apiBaseHint?: string
    apiBasePlaceholder?: string
    apiVersionDefault?: string
    apiVersionHint?: string
    apiVersionRequired?: boolean
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
        id: "azure_openai",
        label: "Azure OpenAI",
        models: ["azure/gpt-4o", "azure/gpt-4o-mini", "azure/gpt-4.1", "azure/o4-mini"],
        modelHint: "LiteLLM Azure OpenAI model string. Use azure/<deployment-name>; if you type only the deployment name, Botify adds azure/ before testing or saving.",
        apiBaseRequired: true,
        apiBaseHint: "Required. Use the Azure OpenAI endpoint, e.g. https://your-resource.openai.azure.com/.",
        apiBasePlaceholder: "https://your-resource.openai.azure.com/",
        apiVersionDefault: "2024-12-01-preview",
        apiVersionHint: "Required by Azure OpenAI. This should match the API version from Azure AI Foundry.",
        apiVersionRequired: true,
        apiKeyHint: "Azure OpenAI resource key",
        docsUrl: "https://docs.litellm.ai/docs/providers/azure",
    },
    {
        id: "azure_ai",
        label: "Azure AI Foundry",
        models: [
            "azure_ai/claude-haiku-4-5-global",
            "azure_ai/claude-haiku-4-5",
            "azure_ai/claude-sonnet-4-5",
            "azure_ai/claude-opus-4-1",
            "azure_ai/command-r-plus",
            "azure_ai/mistral-large-latest",
            "azure_ai/ai21-jamba-instruct",
        ],
        modelHint: "LiteLLM Azure AI Foundry model string. Use azure_ai/<deployment-name>; if you type only the deployment name, Botify adds azure_ai/ before testing or saving.",
        apiBaseRequired: true,
        apiBaseHint: "Required. For Claude, use the Azure AI Foundry /anthropic endpoint. For other Foundry serverless models, use the model inference endpoint.",
        apiBasePlaceholder: "https://your-resource.services.ai.azure.com/anthropic",
        apiKeyHint: "Azure AI Foundry endpoint key",
        docsUrl: "https://docs.litellm.ai/docs/providers/azure_ai",
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
    return PROVIDERS.find((p) => p.id === providerIdFor(id)) || PROVIDERS[0]
}

function providerIdFor(id: string): string {
    return id === "azure" ? "azure_openai" : id
}

function modelForProvider(providerId: string, rawModel: string): string {
    const trimmed = rawModel.trim()
    if (!trimmed) return ""
    if (!trimmed.includes("/")) {
        if (providerId === "azure_openai") return `azure/${trimmed}`
        if (providerId === "azure_ai") return `azure_ai/${trimmed}`
    }
    return trimmed
}

export function LLMConfigEditor({
    slug,
    initial,
}: {
    slug: string
    initial: LLMConfig
}) {
    const initialProviderId = providerIdFor(initial.provider || "openai")
    const [providerId, setProviderId] = useState(initialProviderId)
    const [model, setModel] = useState(initial.model || providerOf(initialProviderId).models[0] || "")
    const [temperature, setTemperature] = useState(initial.temperature ?? 0)
    const [apiBase, setApiBase] = useState(initial.api_base || "")
    const [apiVersion, setApiVersion] = useState(initial.api_version || providerOf(initialProviderId).apiVersionDefault || "")
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
        setApiVersion(p.apiVersionDefault || "")
        setTestResult(null)
    }

    function requestBody() {
        return {
            provider: providerId,
            model: modelForProvider(providerId, model),
            temperature,
            api_base: apiBase.trim(),
            api_version: apiVersion.trim(),
            api_key: apiKey || null,
        }
    }

    async function save(e: React.FormEvent) {
        e.preventDefault()
        setSaving(true)
        setError(null)
        setSavedAt(null)
        try {
            const resp = await fetch(`/api/proxy/tenants/${slug}/llm`, {
                method: "PUT",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(requestBody()),
            })
            if (!resp.ok) {
                throw new Error((await resp.json().catch(() => ({}))).detail || resp.statusText)
            }
            const next: LLMConfig = await resp.json()
            setHasKey(next.has_api_key)
            setModel(next.model)
            setApiBase(next.api_base || "")
            setApiVersion(next.api_version || "")
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
            const body = requestBody()
            if (!body.model) {
                setTestResult({ ok: false, detail: "No model configured.", model: "" })
                return
            }
            if (provider.apiBaseRequired && !body.api_base) {
                setTestResult({ ok: false, detail: "API base URL is required for this provider.", model: body.model })
                return
            }
            if (provider.apiVersionRequired && !body.api_version) {
                setTestResult({ ok: false, detail: "API version is required for this provider.", model: body.model })
                return
            }
            const resp = await fetch(`/api/proxy/tenants/${slug}/llm/test`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(body),
            })
            if (!resp.ok) {
                throw new Error((await resp.json().catch(() => ({}))).detail || resp.statusText)
            }
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

            <Field label="Model" hint={provider.modelHint || "LiteLLM model string. For custom providers, prefix with the provider name (e.g. openai/my-model)."}>
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

            <Field label={`API base URL${provider.apiBaseRequired ? "" : " (optional)"}`} hint={provider.apiBaseHint || "Required for Azure OpenAI or self-hosted OpenAI-compatible endpoints. Leave blank otherwise."}>
                <input
                    className="input mono"
                    type="url"
                    placeholder={provider.apiBasePlaceholder || "https://api.openai.com/v1"}
                    value={apiBase}
                    onChange={(e) => setApiBase(e.target.value)}
                    required={provider.apiBaseRequired}
                />
            </Field>

            {(provider.apiVersionRequired || provider.apiVersionHint || apiVersion) && (
                <Field label={`API version${provider.apiVersionRequired ? "" : " (optional)"}`} hint={provider.apiVersionHint || "Forwarded to LiteLLM as api_version."}>
                    <input
                        className="input mono"
                        placeholder={provider.apiVersionDefault || "2024-12-01-preview"}
                        value={apiVersion}
                        onChange={(e) => setApiVersion(e.target.value)}
                        required={provider.apiVersionRequired}
                    />
                </Field>
            )}

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
