/**
 * GET /api/calendly/oauth/start
 *
 * Kicks off the Calendly OAuth flow. The proxy runs ahead of us on this path
 * (see src/proxy.ts) — it refreshes the Supabase session and propagates the
 * cookies, so we can call getUser() safely and the new tokens survive the
 * cross-site round-trip through Calendly.
 */

import { NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { buildOAuthState, getAuthorizeUrl, SITE_URL } from "@/lib/calendly"

export const runtime = "nodejs"

export async function GET() {
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.redirect(`${SITE_URL}/login?next=/workspace`)
  return NextResponse.redirect(getAuthorizeUrl(buildOAuthState(user.id)))
}
