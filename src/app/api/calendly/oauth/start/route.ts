/**
 * GET /api/calendly/oauth/start
 *
 * Kicks off the Calendly OAuth flow. The client must be signed in. We set a
 * short-lived CSRF `state` cookie and redirect to Calendly's authorize page.
 */

import { NextResponse } from "next/server"
import { randomBytes } from "crypto"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { getAuthorizeUrl, SITE_URL } from "@/lib/calendly"

export const runtime = "nodejs"

export async function GET() {
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) {
    return NextResponse.redirect(`${SITE_URL}/login?next=/workspace`)
  }

  const state = randomBytes(16).toString("hex")
  const res = NextResponse.redirect(getAuthorizeUrl(state))
  res.cookies.set("calendly_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600, // 10 minutes
  })
  return res
}
