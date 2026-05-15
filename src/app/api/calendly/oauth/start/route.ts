/**
 * GET /api/calendly/oauth/start
 *
 * Kicks off the Calendly OAuth flow. The client must be signed in. The state
 * sent to Calendly is an HMAC-signed token carrying the user id, so the
 * callback can identify the user even if the browser drops the auth cookie
 * during the cross-site round-trip.
 */

import { NextResponse } from "next/server"
import { createSupabaseRouteHandlerClient } from "@/lib/supabase-server"
import { buildOAuthState, getAuthorizeUrl, SITE_URL } from "@/lib/calendly"

export const runtime = "nodejs"

export async function GET() {
  // We build the response upfront so any refreshed Supabase auth cookies land
  // on it — otherwise the browser would keep stale tokens, and after the
  // OAuth round-trip the Naywa session would appear expired.
  const response = NextResponse.redirect(SITE_URL) // overwritten below
  const sb = await createSupabaseRouteHandlerClient(response)
  const { data: { user } } = await sb.auth.getUser()
  if (!user) {
    response.headers.set("location", `${SITE_URL}/login?next=/workspace`)
    return response
  }
  response.headers.set("location", getAuthorizeUrl(buildOAuthState(user.id)))
  return response
}
