import { api } from "@/lib/api"
import { LLMConfigEditor } from "./LLMConfigEditor"
import { EmbeddingConfigEditor } from "./EmbeddingConfigEditor"

export default async function LLMConfigPage({
    params,
}: {
    params: Promise<{ slug: string }>
}) {
    const { slug } = await params
    const [llm, embedding] = await Promise.all([
        api.getLLMConfig(slug),
        api.getEmbeddingConfig(slug),
    ])

    return (
        <div>
            <div className="eyebrow">LLM Connectors</div>
            <h1 className="h-display">Models & <em>API keys</em></h1>
            <p className="subdued">
                The chat LLM and the embedding model are configured separately — they're
                often different providers. Both keys are encrypted at rest and never returned
                by the API after save.
            </p>

            <LLMConfigEditor slug={slug} initial={llm} />
            <EmbeddingConfigEditor slug={slug} initial={embedding} />
        </div>
    )
}
