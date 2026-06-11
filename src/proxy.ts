import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

export default async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh session — MUST be called before any auth check
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const protectedPath =
    request.nextUrl.pathname.startsWith("/workspace") ||
    request.nextUrl.pathname.startsWith("/cabinet") ||
    request.nextUrl.pathname.startsWith("/profil")

  if (!user && protectedPath) {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    url.searchParams.set("next", request.nextUrl.pathname)
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  // /api/calendly/oauth/start needs the proxy too: it ensures Supabase auth
  // cookies are refreshed and propagated to the response, so the session
  // survives the cross-site round-trip through Calendly.
  matcher: ["/workspace/:path*", "/cabinet/:path*", "/profil/:path*", "/api/calendly/oauth/start"],
}
