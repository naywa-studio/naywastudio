import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import type { NextResponse } from "next/server"
import type { Database } from "./database.types"

export async function createSupabaseServerClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim(),
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim(),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Server Component — cookie writes are ignored; middleware handles refresh
          }
        },
      },
    }
  )
}

/**
 * For Route Handlers that return a custom NextResponse (e.g. redirects):
 * Supabase may refresh the access token during `getUser()`. Those refreshed
 * cookies MUST be written onto the response we return, otherwise the browser
 * keeps stale, invalidated tokens and the next request sees no session.
 *
 * Pass the response you intend to return; the client writes refresh cookies
 * directly onto it.
 */
export async function createSupabaseRouteHandlerClient(response: NextResponse) {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim(),
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim(),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )
}
