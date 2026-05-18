"use client"
import { logoutAction } from "@/app/login/actions"

export function LogoutButton() {
    return (
        <form action={logoutAction}>
            <button type="submit" className="rail-link" style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                width: "100%",
                textAlign: "left",
                font: "inherit",
                color: "var(--ink-soft)",
                padding: "7px 10px",
                margin: "0 -10px",
            }}>
                Sign out →
            </button>
        </form>
    )
}
