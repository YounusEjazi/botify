"use server"
import { signIn } from "@/auth"
import { AuthError } from "next-auth"
import { redirect } from "next/navigation"

const BACKEND = process.env.BACKEND_URL ?? "http://backend:8000"

export async function loginAction(
    _prev: string | null,
    formData: FormData,
): Promise<string | null> {
    try {
        await signIn("credentials", {
            email: formData.get("email") as string,
            password: formData.get("password") as string,
            redirectTo: "/tenants",
        })
    } catch (e) {
        if (e instanceof AuthError) return "Invalid email or password."
        throw e // re-throw so Next.js can handle the NEXT_REDIRECT
    }
    return null
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

    try {
        await signIn("credentials", { email, password, redirectTo: "/tenants" })
    } catch (e) {
        if (e instanceof AuthError) return "Account created — please sign in."
        throw e
    }
    return null
}
