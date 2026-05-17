"use client"

import { ReactNode } from "react"

export function Notice({ kind = "info", children }: { kind?: "info" | "error" | "success"; children: ReactNode }) {
    const cls = kind === "info" ? "notice" : `notice ${kind}`
    return <div className={cls}>{children}</div>
}

export function Field({
    label, hint, children,
}: { label: string; hint?: string; children: ReactNode }) {
    return (
        <div className="field">
            <label className="field-label">{label}</label>
            {children}
            {hint && <span className="field-hint">{hint}</span>}
        </div>
    )
}

export function Empty({ title, hint }: { title: string; hint?: string }) {
    return (
        <div style={{ padding: "48px 0", textAlign: "center", color: "var(--ink-mute)" }}>
            <div style={{ fontFamily: "var(--f-display)", fontSize: 22 }}>{title}</div>
            {hint && <div style={{ marginTop: 6, fontSize: 13 }}>{hint}</div>}
        </div>
    )
}
