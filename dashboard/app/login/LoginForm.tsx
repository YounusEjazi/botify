"use client"

import { useState, useActionState } from "react"
import { loginAction, registerAction } from "./actions"

function SubmitButton({ label, loading }: { label: string; loading: boolean }) {
    return (
        <button type="submit" className="btn primary" disabled={loading} style={{ marginTop: "0.5rem" }}>
            {loading ? "Please wait…" : label}
        </button>
    )
}

export default function LoginForm() {
    const [tab, setTab] = useState<"signin" | "register">("signin")

    const [loginError, loginAction_, loginPending] = useActionState(loginAction, null)
    const [regError, registerAction_, regPending] = useActionState(registerAction, null)

    const loading = loginPending || regPending
    const error = tab === "signin" ? loginError : regError

    return (
        <div className="card" style={{ width: "100%", maxWidth: 420, padding: "2rem" }}>
            {/* Tabs */}
            <div style={{
                display: "flex",
                gap: "1rem",
                marginBottom: "1.5rem",
                borderBottom: "1px solid var(--rule)",
                paddingBottom: "0.75rem",
            }}>
                {(["signin", "register"] as const).map((t) => (
                    <button
                        key={t}
                        type="button"
                        onClick={() => setTab(t)}
                        style={{
                            fontWeight: tab === t ? 700 : 400,
                            color: tab === t ? "var(--accent)" : "var(--ink-mute)",
                            borderTop: "none",
                            borderLeft: "none",
                            borderRight: "none",
                            borderBottom: tab === t ? "2px solid var(--accent)" : "2px solid transparent",
                            borderRadius: 0,
                            background: "none",
                            padding: "0 0 0.25rem",
                            cursor: "pointer",
                            font: "inherit",
                        }}
                    >
                        {t === "signin" ? "Sign in" : "Create account"}
                    </button>
                ))}
            </div>

            {error && (
                <div className="notice error" style={{ marginBottom: "1rem" }}>{error}</div>
            )}

            <form action={tab === "signin" ? loginAction_ : registerAction_}>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                    <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "0.875rem", color: "var(--ink-soft)" }}>
                        Email
                        <input
                            className="input"
                            name="email"
                            type="email"
                            autoComplete="email"
                            required
                            placeholder="you@company.com"
                        />
                    </label>
                    <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "0.875rem", color: "var(--ink-soft)" }}>
                        Password
                        <input
                            className="input"
                            name="password"
                            type="password"
                            autoComplete={tab === "signin" ? "current-password" : "new-password"}
                            required
                            minLength={8}
                            placeholder="••••••••"
                        />
                    </label>
                    <SubmitButton
                        label={tab === "signin" ? "Sign in →" : "Create account →"}
                        loading={loading}
                    />
                </div>
            </form>
        </div>
    )
}
