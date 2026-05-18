import LoginForm from "./LoginForm"
import Link from "next/link"
import { cookies } from "next/headers"
import { verifySession, SESSION_COOKIE } from "@/lib/session"
import { redirect } from "next/navigation"

export const metadata = {
    title: "Sign in — Bot-ify",
}

export default async function LoginPage() {
    const cookieStore = await cookies()
    const session = await verifySession(cookieStore.get(SESSION_COOKIE)?.value)
    if (session) redirect("/tenants")
    return (
        <div
            style={{
                minHeight: "100vh",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                background: "var(--bg)",
                padding: "2rem",
                gap: "1.5rem",
            }}
        >
            <Link href="/" style={{ textDecoration: "none" }}>
                <span className="h-section" style={{ color: "var(--accent)", letterSpacing: "-0.02em" }}>
                    Bot-ify
                </span>
            </Link>
            <LoginForm />
            <p className="subdued" style={{ fontSize: "0.8rem", textAlign: "center" }}>
                By signing in you agree to our terms of service.
            </p>
        </div>
    )
}
