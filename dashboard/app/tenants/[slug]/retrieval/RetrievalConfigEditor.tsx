"use client"

import { useState } from "react"
import { Field, Notice } from "@/components/ui"
import type { RetrievalConfig } from "@/lib/api"

type RerankProvider = {
    id: string
    label: string
    models: string[]
    apiKeyHint: string
    docsUrl: string
}

const RERANK_PROVIDERS: RerankProvider[] = [
    {
        id: "cohere",
        label: "Cohere",
        models: ["rerank-english-v3.0", "rerank-multilingual-v3.0", "rerank-english-v2.0"],
        apiKeyHint: "From dashboard.cohere.com",
        docsUrl: "https://dashboard.cohere.com/api-keys",
    },
    {
        id: "voyage",
        label: "Voyage AI",
        models: ["voyage/rerank-2", "voyage/rerank-2-lite", "voyage/rerank-lite-1"],
        apiKeyHint: "From dash.voyageai.com",
        docsUrl: "https://dash.voyageai.com/api-keys",
    },
    {
        id: "jina",
        label: "Jina AI",
        models: ["jina_ai/jina-reranker-v2-base-multilingual", "jina_ai/jina-reranker-v1-base-en"],
        apiKeyHint: "From jina.ai/api-key",
        docsUrl: "https://jina.ai/api-key",
    },
]

function providerOf(id: string): RerankProvider {
    return RERANK_PROVIDERS.find((p) => p.id === id) || RERANK_PROVIDERS[0]
}

export function RetrievalConfigEditor({
    slug,
    initial,
}: {
    slug: string
    initial: RetrievalConfig
}) {
    const [mode, setMode] = useState<"hybrid" | "vector">(initial.mode || "hybrid")
    const [candidateK, setCandidateK] = useState(initial.candidate_k ?? 30)
    const [rerankEnabled, setRerankEnabled] = useState(initial.rerank_enabled ?? false)
    const [rerankProviderId, setRerankProviderId] = useState(initial.rerank_provider || "cohere")
    const [rerankModel, setRerankModel] = useState(
        initial.rerank_model || providerOf(initial.rerank_provider || "cohere").models[0]
    )
    const [rerankTopK, setRerankTopK] = useState(initial.rerank_top_k ?? 5)
    const [rerankApiKey, setRerankApiKey] = useState("")
    const [hasRerankKey, setHasRerankKey] = useState(initial.has_rerank_api_key)

    const [saving, setSaving] = useState(false)
    const [savedAt, setSavedAt] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)

    const rerankProvider = providerOf(rerankProviderId)

    function onPickRerankProvider(id: string) {
        setRerankProviderId(id)
        const p = providerOf(id)
        if (!p.models.includes(rerankModel)) setRerankModel(p.models[0])
    }

    async function save(e: React.FormEvent) {
        e.preventDefault()
        setSaving(true)
        setError(null)
        setSavedAt(null)
        try {
            const body = {
                mode,
                candidate_k: candidateK,
                rerank_enabled: rerankEnabled,
                rerank_provider: rerankProviderId,
                rerank_model: rerankModel,
                rerank_top_k: rerankTopK,
                rerank_api_key: rerankApiKey || null,
            }
            const resp = await fetch(`/api/proxy/tenants/${slug}/retrieval`, {
                method: "PUT",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(body),
            })
            if (!resp.ok) {
                throw new Error((await resp.json().catch(() => ({}))).detail || resp.statusText)
            }
            const next: RetrievalConfig = await resp.json()
            setHasRerankKey(next.has_rerank_api_key)
            setRerankApiKey("")
            setSavedAt(new Date().toLocaleTimeString())
        } catch (e: any) {
            setError(e.message)
        } finally {
            setSaving(false)
        }
    }

    async function clearRerankKey() {
        if (!confirm("Remove the saved reranker API key? Reranking will be disabled until you set a new one.")) return
        const resp = await fetch(`/api/proxy/tenants/${slug}/retrieval/key`, { method: "DELETE" })
        if (resp.ok) setHasRerankKey(false)
    }

    return (
        <form className="card" onSubmit={save} style={{ marginTop: 16 }}>
            {error && <Notice kind="error">{error}</Notice>}
            {savedAt && <Notice kind="success">Saved at {savedAt}.</Notice>}

            {/* ── Search mode ── */}
            <Field
                label="Search mode"
                hint="Hybrid fuses vector cosine + BM25 keyword via Reciprocal Rank Fusion — best for most cases. Vector-only uses pure semantic similarity."
            >
                <div className="row" style={{ gap: 12, marginTop: 4 }}>
                    {(["hybrid", "vector"] as const).map((m) => (
                        <label key={m} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                            <input
                                type="radio"
                                name="mode"
                                value={m}
                                checked={mode === m}
                                onChange={() => setMode(m)}
                            />
                            <span style={{ textTransform: "capitalize" }}>{m}</span>
                        </label>
                    ))}
                </div>
            </Field>

            {/* ── Candidate K ── */}
            <Field
                label={`Candidate pool: ${candidateK} chunks`}
                hint="How many chunks are fetched before reranking. Higher = better recall, slower. Only relevant when reranking is enabled."
            >
                <input
                    type="range"
                    min={5} max={200} step={5}
                    value={candidateK}
                    onChange={(e) => setCandidateK(parseInt(e.target.value))}
                />
            </Field>

            {/* ── Reranker toggle ── */}
            <Field
                label="Cross-encoder reranker"
                hint="Runs a second, more accurate model over the candidate pool. Improves precision significantly — costs one extra API call per query."
            >
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                    <input
                        type="checkbox"
                        checked={rerankEnabled}
                        onChange={(e) => setRerankEnabled(e.target.checked)}
                    />
                    Enable reranker
                </label>
            </Field>

            {rerankEnabled && (
                <>
                    <Field label="Rerank provider" hint="Provider for the cross-encoder model. Separate from your chat and embedding providers.">
                        <select
                            className="input"
                            value={rerankProviderId}
                            onChange={(e) => onPickRerankProvider(e.target.value)}
                        >
                            {RERANK_PROVIDERS.map((p) => (
                                <option key={p.id} value={p.id}>{p.label}</option>
                            ))}
                        </select>
                        <div style={{ fontSize: 12, marginTop: 4 }}>
                            <a href={rerankProvider.docsUrl} target="_blank" rel="noreferrer">{rerankProvider.docsUrl}</a>
                        </div>
                    </Field>

                    <Field label="Rerank model" hint="Cross-encoder model string.">
                        <input
                            className="input mono"
                            list="rerank-models"
                            value={rerankModel}
                            onChange={(e) => setRerankModel(e.target.value)}
                            required={rerankEnabled}
                        />
                        <datalist id="rerank-models">
                            {rerankProvider.models.map((m) => <option key={m} value={m} />)}
                        </datalist>
                    </Field>

                    <Field
                        label={`Return top ${rerankTopK} results`}
                        hint="How many chunks the reranker keeps. Should be ≤ Candidate pool."
                    >
                        <input
                            type="range"
                            min={1} max={20} step={1}
                            value={rerankTopK}
                            onChange={(e) => setRerankTopK(parseInt(e.target.value))}
                        />
                    </Field>

                    <Field
                        label="Reranker API key"
                        hint={hasRerankKey ? `A key is already stored. ${rerankProvider.apiKeyHint}. Leave blank to keep the existing key.` : rerankProvider.apiKeyHint}
                    >
                        <input
                            className="input mono"
                            type="password"
                            autoComplete="off"
                            placeholder={hasRerankKey ? "•••••••••• (stored)" : "Paste a key to save"}
                            value={rerankApiKey}
                            onChange={(e) => setRerankApiKey(e.target.value)}
                        />
                        {hasRerankKey && (
                            <button type="button" className="btn" onClick={clearRerankKey} style={{ marginTop: 6 }}>
                                Remove stored key
                            </button>
                        )}
                    </Field>
                </>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
                <button className="btn primary" disabled={saving}>
                    {saving ? "Saving…" : "Save"}
                </button>
            </div>
        </form>
    )
}
