import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { verifySession, SESSION_COOKIE } from "@/lib/session"

export async function middleware(req: NextRequest) {
    const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value)
    if (!session) {
        const url = req.nextUrl.clone()
        url.pathname = "/login"
        return NextResponse.redirect(url)
    }
    return NextResponse.next()
}

export const config = {
    matcher: ["/tenants/:path*", "/account/:path*"],
}
