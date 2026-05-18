/**
 * Lightweight signed-cookie session using Web Crypto (Edge-compatible).
 * Format:  base64url(userId|email|exp).<hmac-sha256>
 *
 * NOT a server action file — these are utilities used by middleware,
 * the proxy, and server actions. Do NOT add "use server".
 */

const SECRET = process.env.AUTH_SECRET ?? "change-me-to-a-random-32-char-secret"
export const SESSION_COOKIE = "botify_session"
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7 // 7 days

async function hmacKey() {
    return crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(SECRET),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign", "verify"],
    )
}

function b64encode(buf: ArrayBuffer | Uint8Array): string {
    const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
    let s = ""
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function b64decode(str: string): Uint8Array {
    str = str.replace(/-/g, "+").replace(/_/g, "/")
    while (str.length % 4) str += "="
    const bin = atob(str)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return bytes
}

export async function signSession(userId: string, email: string): Promise<string> {
    const exp = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE
    const payload = b64encode(new TextEncoder().encode(`${userId}|${email}|${exp}`))
    const key = await hmacKey()
    const sig = b64encode(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)))
    return `${payload}.${sig}`
}

export async function verifySession(
    value: string | null | undefined,
): Promise<{ userId: string; email: string } | null> {
    if (!value) return null
    const [payload, sig] = value.split(".")
    if (!payload || !sig) return null

    try {
        const key = await hmacKey()
        const valid = await crypto.subtle.verify(
            "HMAC",
            key,
            b64decode(sig),
            new TextEncoder().encode(payload),
        )
        if (!valid) return null

        const decoded = new TextDecoder().decode(b64decode(payload))
        const [userId, email, expStr] = decoded.split("|")
        if (!userId || !email || !expStr) return null
        if (parseInt(expStr) < Math.floor(Date.now() / 1000)) return null

        return { userId, email }
    } catch {
        return null
    }
}
