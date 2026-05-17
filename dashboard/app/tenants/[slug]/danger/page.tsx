import { api } from "@/lib/api"
import { DangerZone } from "./DangerZone"

export default async function DangerPage({
    params,
}: {
    params: Promise<{ slug: string }>
}) {
    const { slug } = await params
    const [tenant, llm, docs, convos] = await Promise.all([
        api.getTenant(slug),
        api.getLLMConfig(slug).catch(() => null),
        api.listDocuments(slug).catch(() => []),
        api.listConversations(slug).catch(() => []),
    ])

    return (
        <div>
            <div className="eyebrow">Danger zone</div>
            <h1 className="h-display">Destructive <em>actions</em></h1>
            <p className="subdued">
                Every action below requires typing <code>{tenant.slug}</code> to confirm.
                None of these can be undone.
            </p>

            <DangerZone
                slug={tenant.slug}
                tenantName={tenant.name}
                hasApiKey={llm?.has_api_key ?? false}
                documentCount={docs.length}
                conversationCount={convos.length}
            />
        </div>
    )
}
