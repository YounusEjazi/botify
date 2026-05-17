import { api } from "@/lib/api"
import { BrandingEditor } from "./BrandingEditor"

export default async function BrandingPage({
    params,
}: {
    params: Promise<{ slug: string }>
}) {
    const { slug } = await params
    const tenant = await api.getTenant(slug)

    return (
        <div>
            <div className="eyebrow">{tenant.name} / branding</div>
            <h1 className="h-section">Branding & i18n</h1>
            <p className="subdued">
                Colors, logo, and the strings shown inside the widget. The widget fetches
                these on mount — no rebuild needed when you change them.
            </p>

            <BrandingEditor slug={slug} tenant={tenant} />
        </div>
    )
}
