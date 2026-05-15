/**
 * GET /api/calendly/oauth/start
 *
 * Kicks off the Calendly OAuth flow. The client must be signed in. The CSRF
 * `state` is a server-signed token (HMAC) — no cookie needed, so the flow is
 * immune to Chrome's third-party-cookie restrictions.
 *
 * Refreshed Supabase auth cookies are written directly onto the redirect
 * response so the session survives the OAuth round-trip.
 */

import { NextResponse } from "next/server"
import { createSupabaseRouteHandlerClient } from "@/lib/supabase-server"
import { buildOAuthState, getAuthorizeUrl, SITE_URL } from "@/lib/calendly"

export const runtime = "nodejs"

export async function GET() {
  const response = NextResponse.redirect(getAuthorizeUrl(buildOAuthState()))
  const sb = await createSupabaseRouteHandlerClient(response)
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.redirect(`${SITE_URL}/login?next=/workspace`)
  return response
}
