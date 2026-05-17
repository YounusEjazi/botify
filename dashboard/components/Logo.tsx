/**
 * Bot-ify mark. A capital B with a "spark" dot (read as a chat bubble's tail
 * or as the dot in "Bot."). Uses currentColor so it inherits text color.
 */
export function Logo({ size = 24 }: { size?: number }) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 32 32"
            fill="none"
            aria-label="Bot-ify"
            role="img"
            style={{ display: "block" }}
        >
            {/* vertical stem */}
            <path
                d="M8 5 L8 27"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
            />
            {/* top bowl */}
            <path
                d="M8 5 H16 a5.5 5.5 0 0 1 0 11 H8"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            {/* bottom bowl */}
            <path
                d="M8 16 H17 a5.5 5.5 0 0 1 0 11 H8"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            {/* spark */}
            <circle cx="26" cy="6" r="2.6" fill="currentColor" />
        </svg>
    )
}
