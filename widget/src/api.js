/**
 * Lightweight API client for the widget. Pure fetch — no extra deps so the
 * bundle stays small.
 */

export function createClient({ tenant, apiBase }) {
    const base = (apiBase || "").replace(/\/$/, "")

    async function _fetch(path, init = {}) {
        const headers = new Headers(init.headers || {})
        headers.set("x-tenant-slug", tenant)
        if (init.body && !headers.has("content-type") && typeof init.body === "string") {
            headers.set("content-type", "application/json")
        }
        const resp = await fetch(`${base}${path}`, { ...init, headers, credentials: "omit" })
        if (!resp.ok) {
            let detail = ""
            try { detail = (await resp.json()).detail || "" } catch { /* ignore */ }
            throw new Error(`${resp.status} ${resp.statusText}${detail ? ": " + detail : ""}`)
        }
        return resp.json()
    }

    return {
        async getConfig() {
            return _fetch(`/config/${encodeURIComponent(tenant)}`)
        },

        async chat({ messages, language, sessionId }) {
            return _fetch(`/chat`, {
                method: "POST",
                body: JSON.stringify({
                    messages,
                    language,
                    session_id: sessionId,
                }),
            })
        },

        async submitTicket({ subject, description, name, email, chatHistory }) {
            return _fetch(`/ticket`, {
                method: "POST",
                body: JSON.stringify({
                    subject,
                    description,
                    name,
                    email,
                    chat_history: chatHistory,
                }),
            })
        },

        async rate({ sessionId, rating }) {
            const resp = await fetch(`${base}/rate`, {
                method: "POST",
                headers: { "content-type": "application/json", "x-tenant-slug": tenant },
                body: JSON.stringify({ session_id: sessionId, rating }),
                credentials: "omit",
            })
            // 204 No Content — don't try to parse JSON.
            if (!resp.ok) throw new Error(`Rate failed: ${resp.status}`)
        },
    }
}
