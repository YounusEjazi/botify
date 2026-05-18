/**
 * Server-side API client. All calls go through Next.js Route Handlers so
 * the ADMIN_API_KEY never leaves the server.
 */
const BACKEND = process.env.BACKEND_URL || "http://localhost:8000"
const KEY = process.env.ADMIN_API_KEY || ""

export class ApiError extends Error {
    constructor(public status: number, message: string) {
        super(message)
    }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers)
    headers.set("authorization", `Bearer ${KEY}`)
    if (init.body && !headers.has("content-type") && typeof init.body === "string") {
        headers.set("content-type", "application/json")
    }
    const resp = await fetch(`${BACKEND}${path}`, {
        ...init,
        headers,
        cache: "no-store",
    })
    if (!resp.ok) {
        let detail = resp.statusText
        try {
            const json = await resp.json()
            detail = json.detail || detail
        } catch {
            /* ignore */
        }
        throw new ApiError(resp.status, detail)
    }
    if (resp.status === 204) return undefined as T
    return resp.json() as Promise<T>
}

export type Tenant = {
    id: string
    slug: string
    name: string
    allowed_origins: string[]
    branding: Record<string, any>
    languages: string[]
    default_language: string
    llm_config: Record<string, any>
    system_prompts: Record<string, string>
    ui_strings: Record<string, Record<string, string>>
    guardrails_enabled: boolean
    captcha_required: boolean
    widget_api_key: string
    created_at: string
}

export type LLMConfig = {
    provider: string
    model: string
    temperature: number
    api_base: string
    has_api_key: boolean
}

export type LLMTestResult = {
    ok: boolean
    detail: string
    model: string
}

export type EmbeddingConfig = {
    provider: string
    model: string
    api_base: string
    has_api_key: boolean
}

export type Integration = {
    id: string
    kind: string
    name: string
    enabled: boolean
    config: Record<string, any>
    has_secret: boolean
}

export type RetrievalConfig = {
    mode: "hybrid" | "vector"
    candidate_k: number
    rerank_enabled: boolean
    rerank_provider: string
    rerank_model: string
    rerank_top_k: number
    has_rerank_api_key: boolean
}

export type DailyCount = { date: string; count: number }
export type TopQuestion = { question: string; count: number }
export type Analytics = {
    total_conversations: number
    total_messages: number
    avg_messages_per_conversation: number
    conversations_last_7d: number
    conversations_last_30d: number
    rating_positive: number
    rating_negative: number
    rating_neutral: number
    unrated: number
    daily_conversations: DailyCount[]
    top_questions: TopQuestion[]
    language_breakdown: Record<string, number>
}

export type Document = {
    id: string
    title: string
    source_url: string | null
    mime_type: string | null
    status: string
    chunk_count: number
    error_message: string | null
    created_at: string
}

export const api = {
    listTenants: () => call<Tenant[]>("/admin/tenants"),
    getTenant: (slug: string) => call<Tenant>(`/admin/tenants/${slug}`),
    createTenant: (body: Partial<Tenant>) =>
        call<Tenant>("/admin/tenants", { method: "POST", body: JSON.stringify(body) }),
    updateTenant: (slug: string, body: Partial<Tenant>) =>
        call<Tenant>(`/admin/tenants/${slug}`, { method: "PATCH", body: JSON.stringify(body) }),
    deleteTenant: (slug: string) =>
        call<void>(`/admin/tenants/${slug}`, { method: "DELETE" }),

    getLLMConfig: (slug: string) =>
        call<LLMConfig>(`/admin/tenants/${slug}/llm`),

    getEmbeddingConfig: (slug: string) =>
        call<EmbeddingConfig>(`/admin/tenants/${slug}/embedding`),

    getRetrievalConfig: (slug: string) =>
        call<RetrievalConfig>(`/admin/tenants/${slug}/retrieval`),

    listIntegrations: (slug: string) =>
        call<Integration[]>(`/admin/tenants/${slug}/integrations`),
    createIntegration: (slug: string, body: any) =>
        call<Integration>(`/admin/tenants/${slug}/integrations`, {
            method: "POST", body: JSON.stringify(body),
        }),
    updateIntegration: (id: string, body: any) =>
        call<Integration>(`/admin/integrations/${id}`, {
            method: "PATCH", body: JSON.stringify(body),
        }),
    deleteIntegration: (id: string) =>
        call<void>(`/admin/integrations/${id}`, { method: "DELETE" }),

    listDocuments: (slug: string) =>
        call<Document[]>(`/admin/tenants/${slug}/documents`),
    addDocFromUrl: (slug: string, url: string, title?: string) =>
        call<Document>(`/admin/tenants/${slug}/documents/from-url`, {
            method: "POST", body: JSON.stringify({ url, title }),
        }),
    deleteDocument: (id: string) =>
        call<void>(`/admin/documents/${id}`, { method: "DELETE" }),

    listConversations: (slug: string) =>
        call<any[]>(`/admin/tenants/${slug}/conversations`),
    getConversation: (id: string) =>
        call<any>(`/admin/conversations/${id}`),

    getAnalytics: (slug: string) =>
        call<Analytics>(`/admin/tenants/${slug}/analytics`),
}

// Used by client components to POST FormData (file uploads)
export async function uploadDocument(slug: string, formData: FormData): Promise<Document> {
    const resp = await fetch(`/api/proxy/tenants/${slug}/documents/upload`, {
        method: "POST",
        body: formData,
    })
    if (!resp.ok) throw new Error(await resp.text())
    return resp.json()
}
