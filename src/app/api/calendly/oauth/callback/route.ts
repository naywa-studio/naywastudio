/**
 * GET /api/calendly/oauth/callback?code=…&state=…
 *
 * Calendly redirects here after the client authorizes. The state token carries
 * the initiating user id (signed by us), so we don't depend on the browser
 * still sending the Supabase auth cookie after the cross-site round-trip.
 *
 *   1. Verify the HMAC state, recover the user id.
 *   2. Exchange the code for tokens.
 *   3. Fetch the Calendly identity (user + org + scheduling URL).
 *   4. Persist on the profile via the admin client.
 *   5. Best-effort: create the invitee webhook subscription (needs a paid
 *      Calendly plan — failure here doesn't block the connection).
 */

import { NextRequest, NextResponse } from "next/server"
import { getAdminSupabase } from "@/lib/admin-supabase"
import {
  exchangeCodeForToken,
  getCurrentUser,
  createWebhookSubscription,
  verifyOAuthState,
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
  const userId = state ? verifyOAuthState(state) : null

  if (!code || !userId) {
    console.error("[calendly callback] state verification failed",
      "hasCode=", !!code, "hasState=", !!state)
    return back("error_state")
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
    }).eq("user_id", userId)

    return back(webhookUri ? "connected" : "connected_no_webhook")
  } catch (err) {
    console.error("[calendly callback]", (err as Error).message)
    return back("error")
  }
}
