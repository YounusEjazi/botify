import { api } from "@/lib/api"
import { AnalyticsDashboard } from "./AnalyticsDashboard"

export default async function AnalyticsPage({
    params,
}: {
    params: Promise<{ slug: string }>
}) {
    const { slug } = await params
    const analytics = await api.getAnalytics(slug)

    return (
        <div>
            <div className="eyebrow">Tenant insights</div>
            <h1 className="h-display">Analytics</h1>
            <p className="subdued">
                Conversation volume, user questions, and satisfaction ratings for this tenant.
                Refreshes on every page load.
            </p>
            <AnalyticsDashboard data={analytics} />
        </div>
    )
}
