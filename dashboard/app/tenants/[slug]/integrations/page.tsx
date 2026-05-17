import { api } from "@/lib/api"
import { IntegrationsManager } from "./IntegrationsManager"

export default async function IntegrationsPage({
    params,
}: {
    params: Promise<{ slug: string }>
}) {
    const { slug } = await params
    const integrations = await api.listIntegrations(slug)

    return (
        <div>
            <div className="eyebrow">{slug} / integrations</div>
            <h1 className="h-section">Integrations</h1>
            <p className="subdued">
                Pluggable actions. The chat model will offer these to users when the
                conversation calls for one. Credentials are encrypted at rest.
            </p>
            <IntegrationsManager slug={slug} initial={integrations} />
        </div>
    )
}
