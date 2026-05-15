/**
 * GET /api/calendly/oauth/start
 *
 * Kicks off the Calendly OAuth flow. The client must be signed in. We set a
 * short-lived CSRF `state` cookie and redirect to Calendly's authorize page.
 *
 * Refreshed Supabase auth cookies are written directly onto the redirect
 * response so the session survives the OAuth round-trip.
 */

import { NextResponse } from "next/server"
import { randomBytes } from "crypto"
import { createSupabaseRouteHandlerClient } from "@/lib/supabase-server"
import { getAuthorizeUrl, SITE_URL } from "@/lib/calendly"

export const runtime = "nodejs"

export async function GET() {
  const state = randomBytes(16).toString("hex")
  const response = NextResponse.redirect(getAuthorizeUrl(state))
  response.cookies.set("calendly_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600, // 10 minutes
  })

  const sb = await createSupabaseRouteHandlerClient(response)
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.redirect(`${SITE_URL}/login?next=/workspace`)
  return response
}
