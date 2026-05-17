import { api } from "@/lib/api"
import { ConversationViewer } from "./ConversationViewer"

export default async function ConversationsPage({
    params,
}: {
    params: Promise<{ slug: string }>
}) {
    const { slug } = await params
    const convos = await api.listConversations(slug).catch(() => [])

    return (
        <div>
            <div className="eyebrow">{slug} / conversations</div>
            <h1 className="h-section">Conversations</h1>
            <p className="subdued">
                The most recent {convos.length} sessions for this tenant. Click a row to see the full transcript.
            </p>
            <ConversationViewer convos={convos} />
        </div>
    )
}
