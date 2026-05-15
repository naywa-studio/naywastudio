/**
 * POST /api/calendly/disconnect
 *
 * Disconnects the client's Calendly account: deletes the webhook subscription
 * (best-effort) and clears every calendly_* field on the profile.
 */

import { NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { getAdminSupabase } from "@/lib/admin-supabase"
import { deleteWebhookSubscription } from "@/lib/calendly"

export const runtime = "nodejs"

export async function POST() {
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })

  const admin = getAdminSupabase()
  const { data: profile } = await admin
    .from("profiles")
    .select("calendly_access_token, calendly_webhook_uri")
    .eq("user_id", user.id)
    .single()

  if (profile?.calendly_access_token && profile.calendly_webhook_uri) {
    await deleteWebhookSubscription(profile.calendly_access_token, profile.calendly_webhook_uri)
  }

  await admin.from("profiles").update({
    calendly_access_token: null,
    calendly_refresh_token: null,
    calendly_token_expires_at: null,
    calendly_user_uri: null,
    calendly_org_uri: null,
    calendly_event_type_uri: null,
    calendly_scheduling_url: null,
    calendly_webhook_uri: null,
    calendly_connected_at: null,
  }).eq("user_id", user.id)

  return NextResponse.json({ ok: true })
}
