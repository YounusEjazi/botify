"use client"

import { useState } from "react"
import { Empty } from "@/components/ui"

type Convo = {
    id: string
    session_id: string | null
    language: string | null
    origin: string | null
    created_at: string
    message_count: number
    first_user_message: string
}

type Message = {
    role: string
    content: string
    tool_data: any
    created_at: string
}

export function ConversationViewer({ convos }: { convos: Convo[] }) {
    const [selected, setSelected] = useState<string | null>(null)
    const [messages, setMessages] = useState<Message[]>([])
    const [loading, setLoading] = useState(false)

    async function open(id: string) {
        setSelected(id); setLoading(true); setMessages([])
        try {
            const resp = await fetch(`/api/proxy/conversations/${id}`)
            if (resp.ok) {
                const data = await resp.json()
                setMessages(data.messages || [])
            }
        } finally {
            setLoading(false)
        }
    }

    if (convos.length === 0) {
        return (
            <div className="card">
                <Empty title="No conversations yet" hint="Once someone chats with this tenant's widget, you'll see sessions here." />
            </div>
        )
    }

    return (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.4fr)", gap: 16 }}>
            <div className="card" style={{ padding: 0 }}>
                <table className="table">
                    <thead><tr><th style={{ paddingLeft: 16 }}>First message</th><th>Lang</th><th style={{ paddingRight: 16 }}>When</th></tr></thead>
                    <tbody>
                        {convos.map((c) => (
                            <tr key={c.id} onClick={() => open(c.id)} style={{ cursor: "pointer", background: selected === c.id ? "var(--surface-2)" : "" }}>
                                <td style={{ paddingLeft: 16, maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {c.first_user_message || <em style={{ color: "var(--ink-mute)" }}>(none)</em>}
                                </td>
                                <td style={{ fontFamily: "var(--f-mono)" }}>{c.language || "—"}</td>
                                <td style={{ paddingRight: 16, color: "var(--ink-mute)" }}>
                                    {new Date(c.created_at).toLocaleString()}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="card" style={{ minHeight: 400 }}>
                {!selected && <Empty title="Pick a session" hint="Select one on the left to read the transcript." />}
                {selected && loading && <p style={{ color: "var(--ink-mute)" }}>Loading…</p>}
                {selected && !loading && messages.map((m, i) => (
                    <div key={i} style={{ marginBottom: 14 }}>
                        <div style={{ fontFamily: "var(--f-mono)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: m.role === "user" ? "var(--accent)" : "var(--ink-mute)" }}>
                            {m.role} · {new Date(m.created_at).toLocaleTimeString()}
                        </div>
                        <div style={{ marginTop: 4, whiteSpace: "pre-wrap" }}>{m.content}</div>
                        {m.tool_data?.actions && m.tool_data.actions.length > 0 && (
                            <details style={{ marginTop: 6, fontSize: 12, color: "var(--ink-mute)" }}>
                                <summary style={{ cursor: "pointer" }}>
                                    {m.tool_data.actions.length} tool call(s)
                                </summary>
                                <pre style={{ fontFamily: "var(--f-mono)", fontSize: 11, marginTop: 6, padding: 10, background: "var(--surface-2)", border: "1px solid var(--rule-soft)", overflow: "auto" }}>
                                    {JSON.stringify(m.tool_data.actions, null, 2)}
                                </pre>
                            </details>
                        )}
                    </div>
                ))}
            </div>
        </div>
    )
}
