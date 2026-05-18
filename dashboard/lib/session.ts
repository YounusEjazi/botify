"use server"
/**
 * Lightweight signed-cookie session using Web Crypto (Edge-compatible).
 * Format:  base64(userId|email|exp).<hmac-sha256>
 */

const SECRET = process.env.AUTH_SECRET ?? "change-me-to-a-random-32-char-secret"
const COOKIE = "botify_session"
const MAX_AGE = 60 * 60 * 24 * 7 // 7 days

async function hmacKey() {
    return crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(SECRET),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign", "verify"],
    )
}

function b64url(buf: ArrayBuffer) {
    return Buffer.from(buf).toString("base64url")
}

export async function createSessionCookie(userId: string, email: string): Promise<string> {
    const exp = Math.floor(Date.now() / 1000) + MAX_AGE
    const payload = b64url(new TextEncoder().encode(`${userId}|${email}|${exp}`))
    const key = await hmacKey()
    const sig = b64url(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)))
    const value = `${payload}.${sig}`
    return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE}`
}

export async function verifySession(cookieHeader: string | null): Promise<{ userId: string; email: string } | null> {
    if (!cookieHeader) return null
    const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`))
    if (!match) return null

    const [payload, sig] = match[1].split(".")
    if (!payload || !sig) return null

    try {
        const key = await hmacKey()
        const valid = await crypto.subtle.verify(
            "HMAC",
            key,
            Buffer.from(sig, "base64url"),
            new TextEncoder().encode(payload),
        )
        if (!valid) return null

        const decoded = new TextDecoder().decode(Buffer.from(payload, "base64url"))
        const [userId, email, expStr] = decoded.split("|")
        if (!userId || !email || !expStr) return null
        if (parseInt(expStr) < Math.floor(Date.now() / 1000)) return null

        return { userId, email }
    } catch {
        return null
    }
}

export { COOKIE }
