import { NextRequest, NextResponse } from "next/server"
import { verifySession, SESSION_COOKIE } from "@/lib/session"

const BACKEND = process.env.BACKEND_URL || "http://localhost:8000"
const KEY = process.env.ADMIN_API_KEY || ""

/**
 * Server-side proxy that injects the admin Bearer token + current user identity
 * so client components never see them. /api/proxy/<path> → <BACKEND>/admin/<path>.
 */
async function proxy(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
    const { path } = await params
    const url = new URL(`${BACKEND}/admin/${path.join("/")}`)
    req.nextUrl.searchParams.forEach((v, k) => url.searchParams.set(k, v))

    const headers = new Headers()
    headers.set("authorization", `Bearer ${KEY}`)
    const ct = req.headers.get("content-type")
    if (ct) headers.set("content-type", ct)

    // Forward authenticated user identity to the backend.
    const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value)
    if (session) {
        headers.set("x-user-id", session.userId)
        headers.set("x-user-email", session.email)
    }

    const init: RequestInit = {
        method: req.method,
        headers,
        body: ["GET", "HEAD"].includes(req.method) ? undefined : await req.arrayBuffer(),
    }

    const resp = await fetch(url.toString(), init)

    const respHeaders = new Headers()
    const responseCt = resp.headers.get("content-type")
    if (responseCt) respHeaders.set("content-type", responseCt)

    const nullBody =
        resp.status === 204 || resp.status === 304 || (resp.status >= 100 && resp.status < 200)
    const body = nullBody ? null : await resp.arrayBuffer()

    return new NextResponse(body, { status: resp.status, headers: respHeaders })
}

export { proxy as GET, proxy as POST, proxy as PATCH, proxy as PUT, proxy as DELETE }
