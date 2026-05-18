"use server"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { verifySession, SESSION_COOKIE } from "@/lib/session"

const BACKEND = process.env.BACKEND_URL ?? "http://backend:8000"

async function authHeaders(): Promise<Headers | null> {
    const cookieStore = await cookies()
    const session = await verifySession(cookieStore.get(SESSION_COOKIE)?.value)
    if (!session) return null
    const h = new Headers()
    h.set("x-user-id", session.userId)
    h.set("x-user-email", session.email)
    h.set("content-type", "application/json")
    return h
}

export async function changePasswordAction(
    _prev: string | null,
    formData: FormData,
): Promise<string | null> {
    const headers = await authHeaders()
    if (!headers) return "Not signed in."

    const res = await fetch(`${BACKEND}/api/users/me/password`, {
        method: "POST",
        headers,
        body: JSON.stringify({
            current_password: formData.get("current_password"),
            new_password: formData.get("new_password"),
        }),
    })
    if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        return data.detail ?? "Failed to change password."
    }
    return "Password updated."
}

export async function deleteAccountAction(formData: FormData) {
    const confirm = formData.get("confirm")
    if (confirm !== "DELETE") return
    const headers = await authHeaders()
    if (!headers) return

    await fetch(`${BACKEND}/api/users/me`, { method: "DELETE", headers })

    const cookieStore = await cookies()
    cookieStore.delete(SESSION_COOKIE)
    redirect("/")
}
