import { api } from "@/lib/api"
import { KnowledgeManager } from "./KnowledgeManager"

export default async function KnowledgePage({
    params,
}: {
    params: Promise<{ slug: string }>
}) {
    const { slug } = await params
    const docs = await api.listDocuments(slug)

    return (
        <div>
            <div className="eyebrow">{slug} / knowledge</div>
            <h1 className="h-section">Knowledge base</h1>
            <p className="subdued">
                Upload PDFs, paste URLs, or feed plain text. Each file is chunked,
                embedded, and indexed scoped to this tenant — never visible to others.
            </p>
            <KnowledgeManager slug={slug} initialDocs={docs} />
        </div>
    )
}
