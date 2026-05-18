import { api } from "@/lib/api"
import { RetrievalConfigEditor } from "./RetrievalConfigEditor"

export default async function RetrievalConfigPage({
    params,
}: {
    params: Promise<{ slug: string }>
}) {
    const { slug } = await params
    const retrieval = await api.getRetrievalConfig(slug)

    return (
        <div>
            <div className="eyebrow">Knowledge base</div>
            <h1 className="h-display">Retrieval <em>settings</em></h1>
            <p className="subdued">
                Controls how the knowledge base is searched on every chat turn.
                Hybrid mode (default) fuses semantic vector search with BM25 keyword
                matching — it catches exact terms that embeddings miss. The optional
                cross-encoder reranker runs a second, more accurate pass over the
                candidate pool.
            </p>

            <RetrievalConfigEditor slug={slug} initial={retrieval} />
        </div>
    )
}
