import Link from "next/link"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { Logo } from "@/components/Logo"
import { verifySession, SESSION_COOKIE } from "@/lib/session"
import { logoutAction } from "@/app/login/actions"
import { ChangePasswordForm, DeleteAccountForm } from "./AccountForms"

export const metadata = { title: "Account — Bot-ify" }

const BACKEND = process.env.BACKEND_URL ?? "http://backend:8000"

type Me = { id: string; email: string; created_at: string; tenant_count: number }

async function fetchMe(userId: string, email: string): Promise<Me | null> {
    const res = await fetch(`${BACKEND}/api/users/me`, {
        headers: { "x-user-id": userId, "x-user-email": email },
        cache: "no-store",
    })
    if (!res.ok) return null
    return res.json()
}

export default async function AccountPage() {
    const cookieStore = await cookies()
    const session = await verifySession(cookieStore.get(SESSION_COOKIE)?.value)
    if (!session) redirect("/login")

    const me = await fetchMe(session.userId, session.email)

    return (
        <div className="container" style={{ padding: "56px 32px 80px", maxWidth: 720 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--ink)", textDecoration: "none" }}>
                    <Logo size={28} />
                    <span style={{ fontFamily: "var(--f-display)", fontSize: 22, letterSpacing: "-0.01em" }}>
                        Bot<em style={{ fontStyle: "italic", color: "var(--accent)" }}>-ify</em>
                    </span>
                </Link>
                <div style={{ display: "flex", gap: 8 }}>
                    <Link href="/tenants" className="btn small">Tenants</Link>
                    <form action={logoutAction}>
                        <button type="submit" className="btn small">Sign out</button>
                    </form>
                </div>
            </div>

            <div className="eyebrow">Account</div>
            <h1 className="h-display">Your account</h1>
            <p className="subdued">Manage your profile, security, and data.</p>

            <div className="card">
                <div className="card-header"><h2 className="card-title">Profile</h2></div>
                <table className="table" style={{ marginTop: 4 }}>
                    <tbody>
                        <tr>
                            <td style={{ width: 160, color: "var(--ink-mute)" }}>Email</td>
                            <td style={{ fontFamily: "var(--f-mono)" }}>{session.email}</td>
                        </tr>
                        <tr>
                            <td style={{ color: "var(--ink-mute)" }}>User ID</td>
                            <td style={{ fontFamily: "var(--f-mono)", fontSize: 12 }}>{session.userId}</td>
                        </tr>
                        {me && (
                            <>
                                <tr>
                                    <td style={{ color: "var(--ink-mute)" }}>Member since</td>
                                    <td suppressHydrationWarning>{new Date(me.created_at).toLocaleDateString()}</td>
                                </tr>
                                <tr>
                                    <td style={{ color: "var(--ink-mute)" }}>Tenants owned</td>
                                    <td>{me.tenant_count}</td>
                                </tr>
                            </>
                        )}
                    </tbody>
                </table>
            </div>

            <div className="card">
                <div className="card-header"><h2 className="card-title">Change password</h2></div>
                <ChangePasswordForm />
            </div>

            <div className="card" style={{ borderColor: "var(--negative)" }}>
                <div className="card-header">
                    <h2 className="card-title" style={{ color: "var(--negative)" }}>Danger zone</h2>
                </div>
                <DeleteAccountForm tenantCount={me?.tenant_count ?? 0} />
            </div>
        </div>
    )
}
