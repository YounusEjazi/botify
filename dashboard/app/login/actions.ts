"use server"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { createSessionCookie } from "@/lib/session"

const BACKEND = process.env.BACKEND_URL ?? "http://backend:8000"

export async function loginAction(
    _prev: string | null,
    formData: FormData,
): Promise<string | null> {
    const email = formData.get("email") as string
    const password = formData.get("password") as string

    const res = await fetch(`${BACKEND}/api/users/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
    })

    if (!res.ok) return "Invalid email or password."

    const user = await res.json()
    const cookieStore = await cookies()
    cookieStore.set({
        name: "botify_session",
        value: await buildSessionValue(user.id, email),
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 7,
    })

    redirect("/tenants")
}

export async function registerAction(
    _prev: string | null,
    formData: FormData,
): Promise<string | null> {
    const email = formData.get("email") as string
    const password = formData.get("password") as string

    const res = await fetch(`${BACKEND}/api/users/register`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
    })

    if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        return data.detail ?? "Registration failed."
    }

    const user = await res.json()
    const cookieStore = await cookies()
    cookieStore.set({
        name: "botify_session",
        value: await buildSessionValue(user.id, email),
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 7,
    })

    redirect("/tenants")
}

export async function logoutAction() {
    const cookieStore = await cookies()
    cookieStore.delete("botify_session")
    redirect("/login")
}

// ── helpers ──────────────────────────────────────────────────────────────────

async function buildSessionValue(userId: string, email: string): Promise<string> {
    const SECRET = process.env.AUTH_SECRET ?? "change-me-to-a-random-32-char-secret"
    const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7
    const payload = Buffer.from(`${userId}|${email}|${exp}`).toString("base64url")
    const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(SECRET),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
    )
    const sig = Buffer.from(
        await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload))
    ).toString("base64url")
    return `${payload}.${sig}`
}
