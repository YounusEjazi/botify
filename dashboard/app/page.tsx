import Link from "next/link"
import { Logo } from "@/components/Logo"

export default function Home() {
    return (
        <div style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--bg)",
        }}>
            <div style={{ textAlign: "center", maxWidth: 480, padding: "0 32px" }}>
                <div style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 12,
                    marginBottom: 24,
                    color: "var(--ink)",
                }}>
                    <Logo size={40} />
                    <span style={{
                        fontFamily: "var(--f-display)",
                        fontSize: 36,
                        letterSpacing: "-0.01em",
                        lineHeight: 1,
                    }}>
                        Bot<em style={{ fontStyle: "italic", color: "var(--accent)" }}>-ify</em>
                    </span>
                </div>

                <p style={{
                    fontFamily: "var(--f-body)",
                    fontSize: 16,
                    color: "var(--ink-mute)",
                    lineHeight: 1.6,
                    margin: "0 0 40px",
                }}>
                    Multi-tenant AI chatbot platform. Give any business its own widget, knowledge base, and LLM configuration.
                </p>

                <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "center" }}>
                    <Link
                        href="/tenants"
                        className="btn primary"
                        style={{ fontSize: 15, padding: "12px 28px", textDecoration: "none", minWidth: 200, justifyContent: "center" }}
                    >
                        Go to Tenants →
                    </Link>
                    <Link
                        href="/docs"
                        className="btn"
                        style={{ fontSize: 14, padding: "10px 28px", textDecoration: "none", minWidth: 200, justifyContent: "center" }}
                    >
                        Documentation →
                    </Link>
                </div>
            </div>
        </div>
    )
}
