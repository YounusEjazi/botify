import type { Metadata } from "next"
import "./globals.css"
import { SessionProvider } from "next-auth/react"

export const metadata: Metadata = {
    title: "Bot-ify",
    description: "Turn any business into a bot. Multi-tenant chatbot admin.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en">
            <body>
                <SessionProvider>{children}</SessionProvider>
            </body>
        </html>
    )
}
