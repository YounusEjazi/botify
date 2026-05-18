"use client"

import { useState } from "react"
import { signIn } from "next-auth/react"
import { useRouter } from "next/navigation"

const BACKEND_PROXY = "/api/proxy/users/register"

export default function LoginForm() {
    const router = useRouter()
    const [tab, setTab] = useState<"signin" | "register">("signin")
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [error, setError] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)

    async function handleSignIn(e: React.FormEvent) {
        e.preventDefault()
        setError(null)
        setLoading(true)
        try {
            const result = await signIn("credentials", {
                email,
                password,
                redirect: false,
            })
            if (result?.error) {
                setError("Invalid email or password.")
            } else {
                router.push("/tenants")
            }
        } finally {
            setLoading(false)
        }
    }

    async function handleRegister(e: React.FormEvent) {
        e.preventDefault()
        setError(null)
        setLoading(true)
        try {
            const res = await fetch(BACKEND_PROXY, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ email, password }),
            })
            if (!res.ok) {
                const data = await res.json().catch(() => ({}))
                setError(data.detail ?? "Registration failed.")
                return
            }
            // Auto-login after registration
            const result = await signIn("credentials", {
                email,
                password,
                redirect: false,
            })
            if (result?.error) {
                setError("Account created — please sign in.")
                setTab("signin")
            } else {
                router.push("/tenants")
            }
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="card" style={{ width: "100%", maxWidth: 420, padding: "2rem" }}>
            {/* Tabs */}
            <div
                style={{
                    display: "flex",
                    gap: "1rem",
                    marginBottom: "1.5rem",
                    borderBottom: "1px solid var(--rule)",
                    paddingBottom: "0.75rem",
                }}
            >
                <button
                    type="button"
                    className="btn"
                    onClick={() => { setTab("signin"); setError(null) }}
                    style={{
                        fontWeight: tab === "signin" ? 700 : 400,
                        color: tab === "signin" ? "var(--accent)" : "var(--ink-mute)",
                        borderBottom: tab === "signin" ? "2px solid var(--accent)" : "2px solid transparent",
                        borderRadius: 0,
                        background: "none",
                        padding: "0 0 0.25rem",
                    }}
                >
                    Sign in
                </button>
                <button
                    type="button"
                    className="btn"
                    onClick={() => { setTab("register"); setError(null) }}
                    style={{
                        fontWeight: tab === "register" ? 700 : 400,
                        color: tab === "register" ? "var(--accent)" : "var(--ink-mute)",
                        borderBottom: tab === "register" ? "2px solid var(--accent)" : "2px solid transparent",
                        borderRadius: 0,
                        background: "none",
                        padding: "0 0 0.25rem",
                    }}
                >
                    Create account
                </button>
            </div>

            {error && (
                <div className="notice" style={{ marginBottom: "1rem", color: "var(--negative)" }}>
                    {error}
                </div>
            )}

            <form onSubmit={tab === "signin" ? handleSignIn : handleRegister}>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                    <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "0.875rem", color: "var(--ink-soft)" }}>
                        Email
                        <input
                            className="input"
                            type="email"
                            autoComplete="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="you@company.com"
                            style={{
                                padding: "0.5rem 0.75rem",
                                border: "1px solid var(--rule)",
                                borderRadius: 6,
                                background: "var(--surface)",
                                color: "var(--ink)",
                                fontSize: "1rem",
                                outline: "none",
                            }}
                        />
                    </label>
                    <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "0.875rem", color: "var(--ink-soft)" }}>
                        Password
                        <input
                            className="input"
                            type="password"
                            autoComplete={tab === "signin" ? "current-password" : "new-password"}
                            required
                            minLength={8}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            style={{
                                padding: "0.5rem 0.75rem",
                                border: "1px solid var(--rule)",
                                borderRadius: 6,
                                background: "var(--surface)",
                                color: "var(--ink)",
                                fontSize: "1rem",
                                outline: "none",
                            }}
                        />
                    </label>
                    <button
                        type="submit"
                        className="btn primary"
                        disabled={loading}
                        style={{ marginTop: "0.5rem" }}
                    >
                        {loading
                            ? "Please wait…"
                            : tab === "signin"
                            ? "Sign in →"
                            : "Create account →"}
                    </button>
                </div>
            </form>
        </div>
    )
}
