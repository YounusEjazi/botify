"use client"

import type { Analytics } from "@/lib/api"

// ── Stat card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
    return (
        <div style={{
            background: "white", borderRadius: 12, padding: "20px 24px",
            border: "1px solid var(--border)", flex: "1 1 160px",
        }}>
            <div style={{ fontSize: 13, color: "var(--ink-mute)", marginBottom: 6 }}>{label}</div>
            <div style={{ fontFamily: "var(--f-display)", fontSize: 32, lineHeight: 1 }}>{value}</div>
            {sub && <div style={{ fontSize: 12, color: "var(--ink-mute)", marginTop: 4 }}>{sub}</div>}
        </div>
    )
}

// ── Bar chart (pure SVG, no deps) ────────────────────────────────────────────
function BarChart({ data }: { data: { date: string; count: number }[] }) {
    const W = 680, H = 140, PAD = { top: 10, right: 8, bottom: 32, left: 32 }
    const chartW = W - PAD.left - PAD.right
    const chartH = H - PAD.top - PAD.bottom
    const maxVal = Math.max(...data.map(d => d.count), 1)
    const barW = Math.max(1, chartW / data.length - 2)

    // Only show every 5th date label to avoid crowding.
    const labelIndices = new Set(data.map((_, i) => i).filter(i => i % 5 === 0 || i === data.length - 1))

    return (
        <svg
            viewBox={`0 0 ${W} ${H}`}
            style={{ width: "100%", height: "auto", display: "block" }}
            aria-label="Daily conversations bar chart"
        >
            {/* Y-axis gridlines */}
            {[0, 0.25, 0.5, 0.75, 1].map(t => {
                const y = PAD.top + chartH * (1 - t)
                const val = Math.round(maxVal * t)
                return (
                    <g key={t}>
                        <line x1={PAD.left} x2={W - PAD.right} y1={y} y2={y}
                            stroke="#f0f0f0" strokeWidth="1" />
                        <text x={PAD.left - 4} y={y + 4} textAnchor="end"
                            fontSize="9" fill="#bbb">{val}</text>
                    </g>
                )
            })}

            {/* Bars */}
            {data.map((d, i) => {
                const x = PAD.left + i * (chartW / data.length) + 1
                const barH = (d.count / maxVal) * chartH
                const y = PAD.top + chartH - barH
                return (
                    <g key={d.date}>
                        <rect x={x} y={y} width={barW} height={barH}
                            fill="var(--accent)" rx="2" opacity="0.85" />
                        {labelIndices.has(i) && (
                            <text
                                x={x + barW / 2} y={H - PAD.bottom + 12}
                                textAnchor="middle" fontSize="8" fill="#bbb"
                            >
                                {d.date.slice(5)}
                            </text>
                        )}
                    </g>
                )
            })}
        </svg>
    )
}

// ── Rating donut ─────────────────────────────────────────────────────────────
function RatingBar({ pos, neg, neutral, unrated }: { pos: number; neg: number; neutral: number; unrated: number }) {
    const total = pos + neg + neutral + unrated || 1
    const pct = (n: number) => Math.round((n / total) * 100)
    const segments = [
        { label: "Positive", count: pos,     color: "#22c55e", pct: pct(pos) },
        { label: "Negative", count: neg,     color: "#ef4444", pct: pct(neg) },
        { label: "Neutral",  count: neutral, color: "#94a3b8", pct: pct(neutral) },
        { label: "Unrated",  count: unrated, color: "#f1f5f9", pct: pct(unrated) },
    ]
    return (
        <div>
            <div style={{ display: "flex", height: 10, borderRadius: 6, overflow: "hidden", gap: 2 }}>
                {segments.map(s => s.count > 0 && (
                    <div key={s.label} style={{ flex: s.count, background: s.color, minWidth: 4 }} />
                ))}
            </div>
            <div style={{ display: "flex", gap: 16, marginTop: 10, flexWrap: "wrap" }}>
                {segments.map(s => (
                    <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--ink-mute)" }}>
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color, display: "inline-block" }} />
                        {s.label}: <strong style={{ color: "var(--ink-base)" }}>{s.count}</strong>
                        <span style={{ color: "#ccc" }}>({s.pct}%)</span>
                    </div>
                ))}
            </div>
        </div>
    )
}

// ── Main component ────────────────────────────────────────────────────────────
export function AnalyticsDashboard({ data }: { data: Analytics }) {
    const rated = data.rating_positive + data.rating_negative + data.rating_neutral
    const satisfactionPct = rated > 0
        ? Math.round((data.rating_positive / rated) * 100)
        : null

    const languages = Object.entries(data.language_breakdown)
        .sort((a, b) => b[1] - a[1])

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 24, marginTop: 24 }}>

            {/* ── Stat cards ── */}
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                <StatCard label="Total conversations" value={data.total_conversations.toLocaleString()} />
                <StatCard label="Last 7 days" value={data.conversations_last_7d.toLocaleString()} />
                <StatCard label="Last 30 days" value={data.conversations_last_30d.toLocaleString()} />
                <StatCard label="Total messages" value={data.total_messages.toLocaleString()}
                    sub={`avg ${data.avg_messages_per_conversation} per conversation`} />
                <StatCard
                    label="Satisfaction"
                    value={satisfactionPct !== null ? `${satisfactionPct}%` : "—"}
                    sub={rated > 0 ? `${rated} rated` : "No ratings yet"}
                />
            </div>

            {/* ── Volume chart ── */}
            <div className="card">
                <div className="card-header">
                    <h2 className="card-title">Conversations — last 30 days</h2>
                </div>
                <BarChart data={data.daily_conversations} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

                {/* ── Top questions ── */}
                <div className="card">
                    <div className="card-header">
                        <h2 className="card-title">Top questions</h2>
                        <span className="badge">by frequency</span>
                    </div>
                    {data.top_questions.length === 0 ? (
                        <p style={{ color: "var(--ink-mute)", fontSize: 13, padding: "8px 0" }}>
                            No conversations yet.
                        </p>
                    ) : (
                        <ol style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 10 }}>
                            {data.top_questions.map((q, i) => (
                                <li key={i} style={{ fontSize: 13 }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                                        <span style={{ flex: 1, wordBreak: "break-word" }}>{q.question}</span>
                                        <span style={{
                                            background: "var(--surface-raised)", borderRadius: 20,
                                            padding: "1px 8px", fontSize: 11,
                                            color: "var(--ink-mute)", whiteSpace: "nowrap",
                                        }}>×{q.count}</span>
                                    </div>
                                </li>
                            ))}
                        </ol>
                    )}
                </div>

                {/* ── Ratings + languages ── */}
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    <div className="card">
                        <div className="card-header">
                            <h2 className="card-title">Ratings</h2>
                        </div>
                        <RatingBar
                            pos={data.rating_positive}
                            neg={data.rating_negative}
                            neutral={data.rating_neutral}
                            unrated={data.unrated}
                        />
                    </div>

                    <div className="card">
                        <div className="card-header">
                            <h2 className="card-title">Languages</h2>
                        </div>
                        {languages.length === 0 ? (
                            <p style={{ color: "var(--ink-mute)", fontSize: 13 }}>No data yet.</p>
                        ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                {languages.map(([lang, count]) => {
                                    const total = languages.reduce((s, [, n]) => s + n, 0)
                                    const pct = Math.round((count / total) * 100)
                                    return (
                                        <div key={lang}>
                                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 3 }}>
                                                <span style={{ textTransform: "uppercase", fontFamily: "var(--f-mono)", fontSize: 11 }}>{lang}</span>
                                                <span style={{ color: "var(--ink-mute)" }}>{count} ({pct}%)</span>
                                            </div>
                                            <div style={{ height: 5, background: "#f0f0f0", borderRadius: 4 }}>
                                                <div style={{ height: "100%", width: `${pct}%`, background: "var(--accent)", borderRadius: 4 }} />
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
