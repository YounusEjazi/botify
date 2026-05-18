"use server"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { signSession, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/session"

const BACKEND = process.env.BACKEND_URL ?? "http://backend:8000"

async function setSession(userId: string, email: string) {
    const cookieStore = await cookies()
    cookieStore.set({
        name: SESSION_COOKIE,
        value: await signSession(userId, email),
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: SESSION_MAX_AGE,
    })
}

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
    await setSession(user.id, email)
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
    await setSession(user.id, email)
    redirect("/tenants")
}

export async function logoutAction() {
    const cookieStore = await cookies()
    cookieStore.delete(SESSION_COOKIE)
    redirect("/login")
}
