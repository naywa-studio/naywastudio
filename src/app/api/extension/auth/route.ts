/**
 * GET /api/extension/auth
 * Called by the Chrome extension content script.
 * Reads the Supabase session from SSR cookies (set by createBrowserClient)
 * and returns the access_token + user_id so the extension can authenticate.
 *
 * The browser sends cookies automatically — no CORS needed (same origin).
 */

import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import type { Database } from "@/lib/database.types"

export async function GET(_req: NextRequest) {
  const cookieStore = await cookies()

  const sb = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},   // read-only — we don't need to write cookies here
      },
    }
  )

  const { data: { session }, error } = await sb.auth.getSession()

  if (error || !session) {
    return NextResponse.json({ authenticated: false }, { status: 401 })
  }

  return NextResponse.json({
    authenticated: true,
    access_token:  session.access_token,
    user_id:       session.user.id,
    expires_at:    session.expires_at,
  })
}
