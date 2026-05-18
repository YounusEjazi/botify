import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"

const BACKEND = process.env.BACKEND_URL ?? "http://backend:8000"

export const { handlers, signIn, signOut, auth } = NextAuth({
    providers: [
        Credentials({
            credentials: {
                email: { label: "Email", type: "email" },
                password: { label: "Password", type: "password" },
            },
            async authorize(credentials) {
                try {
                    const res = await fetch(`${BACKEND}/api/users/login`, {
                        method: "POST",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({
                            email: credentials.email,
                            password: credentials.password,
                        }),
                    })
                    if (!res.ok) return null
                    const user = await res.json()
                    return { id: user.id, email: user.email }
                } catch {
                    return null
                }
            },
        }),
    ],
    pages: { signIn: "/login" },
    session: { strategy: "jwt" },
    secret: process.env.AUTH_SECRET,
})
