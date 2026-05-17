import { api } from "@/lib/api"
import { PromptEditor } from "./PromptEditor"

export default async function PromptPage({
    params,
}: {
    params: Promise<{ slug: string }>
}) {
    const { slug } = await params
    const tenant = await api.getTenant(slug)

    return (
        <div>
            <div className="eyebrow">{tenant.name} / prompt</div>
            <h1 className="h-section">System prompt</h1>
            <p className="subdued">
                One prompt per supported language. This used to live in your Python
                source — now it's an editable row. Changes take effect on the next chat
                turn; no redeploy.
            </p>

            <PromptEditor
                slug={slug}
                languages={tenant.languages}
                initial={tenant.system_prompts}
            />
        </div>
    )
}
