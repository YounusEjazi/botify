"use client"

import { useActionState, useState } from "react"
import { changePasswordAction, deleteAccountAction } from "./actions"

export function ChangePasswordForm() {
    const [msg, action, pending] = useActionState(changePasswordAction, null)
    const isError = msg && msg !== "Password updated."

    return (
        <form action={action}>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {msg && (
                    <div className={`notice ${isError ? "error" : "success"}`}>{msg}</div>
                )}
                <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, color: "var(--ink-soft)" }}>
                    Current password
                    <input
                        className="input"
                        type="password"
                        name="current_password"
                        required
                        autoComplete="current-password"
                    />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, color: "var(--ink-soft)" }}>
                    New password
                    <input
                        className="input"
                        type="password"
                        name="new_password"
                        required
                        minLength={8}
                        autoComplete="new-password"
                    />
                </label>
                <button type="submit" className="btn primary" disabled={pending} style={{ alignSelf: "flex-start" }}>
                    {pending ? "Updating…" : "Update password"}
                </button>
            </div>
        </form>
    )
}

export function DeleteAccountForm({ tenantCount }: { tenantCount: number }) {
    const [confirming, setConfirming] = useState(false)

    if (!confirming) {
        return (
            <div>
                <p style={{ color: "var(--ink-soft)", marginBottom: 12, fontSize: 13 }}>
                    Permanently delete your account and {tenantCount} tenant{tenantCount === 1 ? "" : "s"} you own.
                    All conversations, documents, integrations, and indexed data will be erased.
                    <strong style={{ color: "var(--negative)" }}> This cannot be undone.</strong>
                </p>
                <button type="button" className="btn danger" onClick={() => setConfirming(true)}>
                    Delete my account
                </button>
            </div>
        )
    }

    return (
        <form action={deleteAccountAction}>
            <p style={{ color: "var(--ink-soft)", marginBottom: 12, fontSize: 13 }}>
                Type <code style={{ fontFamily: "var(--f-mono)", background: "var(--surface-2)", padding: "1px 5px" }}>DELETE</code> to
                confirm permanent deletion of your account and {tenantCount} tenant{tenantCount === 1 ? "" : "s"}.
            </p>
            <div style={{ display: "flex", gap: 8 }}>
                <input
                    className="input"
                    name="confirm"
                    required
                    pattern="DELETE"
                    placeholder="DELETE"
                    autoComplete="off"
                    style={{ flex: 1, maxWidth: 200 }}
                />
                <button type="submit" className="btn danger">Permanently delete</button>
                <button type="button" className="btn" onClick={() => setConfirming(false)}>
                    Cancel
                </button>
            </div>
        </form>
    )
}
