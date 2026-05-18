import { auth } from "./auth"

export default auth((req) => {
    // redirect to /login if not authenticated and accessing protected routes
})

export const config = {
    matcher: ["/tenants/:path*"],
}
