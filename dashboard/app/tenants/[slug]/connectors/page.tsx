import { api } from "@/lib/api"
import { ConnectorsPage } from "./ConnectorsPage"

export default async function ConnectorsRoute({
    params,
}: {
    params: Promise<{ slug: string }>
}) {
    const { slug } = await params
    const connectors = await api.listConnectors(slug)

    return (
        <div>
            <div className="eyebrow">{slug} / connectors</div>
            <h1 className="h-section">Knowledge Connectors</h1>
            <p className="subdued">
                Sync content from Notion or Google Drive into the knowledge base. Documents are
                chunked, embedded, and indexed automatically. Credentials are encrypted at rest.
            </p>
            <ConnectorsPage slug={slug} initial={connectors} />
        </div>
    )
}
