/**
 * GET /api/calendly/oauth/start
 *
 * Kicks off the Calendly OAuth flow. The client must be signed in. The state
 * sent to Calendly is an HMAC-signed token carrying the user id, so the
 * callback can identify the user even if the browser drops the auth cookie
 * during the cross-site round-trip.
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
