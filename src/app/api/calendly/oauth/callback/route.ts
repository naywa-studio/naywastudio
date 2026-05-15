/**
 * GET /api/calendly/oauth/callback?code=…&state=…
 *
 * Calendly redirects here after the client authorizes. We:
 *   1. Verify the CSRF state cookie.
 *   2. Exchange the code for tokens.
 *   3. Fetch the client's Calendly identity (user + org + scheduling URL).
 *   4. Persist everything on the profile.
 *   5. Best-effort: create the invitee webhook subscription (needs a paid
 *      Calendly plan — failure here doesn't block the connection).
 *
 * Refreshed Supabase auth cookies are written directly onto the redirect
 * response so the session survives the OAuth round-trip.
 */

import { NextRequest, NextResponse } from "next/server"
import { createSupabaseRouteHandlerClient } from "@/lib/supabase-server"
import { getAdminSupabase } from "@/lib/admin-supabase"
import {
  exchangeCodeForToken,
  getCurrentUser,
  createWebhookSubscription,
  SITE_URL,
} from "@/lib/calendly"

export const runtime = "nodejs"
export const maxDuration = 30

function back(status: string) {
  return NextResponse.redirect(`${SITE_URL}/workspace?calendly=${status}`)
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code")
  const state = req.nextUrl.searchParams.get("state")
  const cookieState = req.cookies.get("calendly_oauth_state")?.value

  if (!code || !state || !cookieState || state !== cookieState) {
    console.error("[calendly callback] state check failed:",
      "hasCode=", !!code, "hasState=", !!state, "hasCookie=", !!cookieState,
      "match=", state === cookieState)
    return back("error_state")
  }

  // Build the response upfront so Supabase refresh cookies land on it.
  const successResponse = back("connected")
  const sb = await createSupabaseRouteHandlerClient(successResponse)
  const { data: { user } } = await sb.auth.getUser()
  if (!user) {
    console.error("[calendly callback] no session after Calendly round-trip")
    // Reuse successResponse so refreshed Supabase cookies (if any) land on the
    // /login redirect — otherwise the browser keeps stale tokens.
    successResponse.headers.set("location", `${SITE_URL}/login?next=/workspace`)
    return successResponse
  }

  try {
    const token = await exchangeCodeForToken(code)
    const me = await getCurrentUser(token.accessToken)

    const admin = getAdminSupabase()

    // Best-effort webhook subscription — requires a paid Calendly plan.
    let webhookUri: string | null = null
    try {
      webhookUri = await createWebhookSubscription(
        token.accessToken,
        me.organizationUri,
        me.uri,
      )
    } catch (err) {
      console.error("[calendly callback] webhook subscription failed:", (err as Error).message)
    }

    await admin.from("profiles").update({
      calendly_access_token: token.accessToken,
      calendly_refresh_token: token.refreshToken,
      calendly_token_expires_at: token.expiresAt,
      calendly_user_uri: me.uri,
      calendly_org_uri: me.organizationUri,
      calendly_scheduling_url: me.schedulingUrl,
      calendly_webhook_uri: webhookUri,
      calendly_connected_at: new Date().toISOString(),
    }).eq("user_id", user.id)

    // Redirect URL depends on whether the webhook subscription succeeded.
    // We can't change the URL on `successResponse` after construction, so
    // build a new redirect (carrying the refreshed auth cookies).
    const finalResponse = back(webhookUri ? "connected" : "connected_no_webhook")
    successResponse.cookies.getAll().forEach((c) => {
      finalResponse.cookies.set(c.name, c.value, c)
    })
    finalResponse.cookies.delete("calendly_oauth_state")
    return finalResponse
  } catch (err) {
    console.error("[calendly callback]", (err as Error).message)
    return back("error")
  }
}
