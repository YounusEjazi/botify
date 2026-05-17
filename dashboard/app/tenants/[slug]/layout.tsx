import { api } from "@/lib/api"
import { TenantSidebar } from "@/components/Sidebar"
import { notFound } from "next/navigation"

export default async function TenantLayout({
    children,
    params,
}: {
    children: React.ReactNode
    params: Promise<{ slug: string }>
}) {
    const { slug } = await params
    let tenant
    try {
        tenant = await api.getTenant(slug)
    } catch {
        notFound()
    }

    return (
        <div className="shell">
            <TenantSidebar slug={slug} name={tenant.name} />
            <main className="shell-main">{children}</main>
        </div>
    )
}
