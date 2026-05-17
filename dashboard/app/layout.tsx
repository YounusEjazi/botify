import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
    title: "Bot-ify",
    description: "Turn any business into a bot. Multi-tenant chatbot admin.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en">
            <body>{children}</body>
        </html>
    )
}
