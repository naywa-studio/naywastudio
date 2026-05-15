/**
 * GET   /api/calendly/event-types   — list the client's active Calendly meeting types
 * PATCH /api/calendly/event-types   { uri } — pick the one used for candidate booking
 *
 * The chosen event type's scheduling URL is what the public booking page embeds.
 */

import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { getAdminSupabase } from "@/lib/admin-supabase"
import { getValidAccessToken, getCurrentUser, listEventTypes } from "@/lib/calendly"

export const runtime = "nodejs"
export const maxDuration = 30

export async function GET() {
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })

  const admin = getAdminSupabase()
  const token = await getValidAccessToken(admin, user.id)
  if (!token) return NextResponse.json({ error: "not_connected" }, { status: 400 })

  const { data: profile } = await admin
    .from("profiles")
    .select("calendly_user_uri, calendly_event_type_uri")
    .eq("user_id", user.id)
    .single()

  let userUri = profile?.calendly_user_uri
  if (!userUri) {
    userUri = (await getCurrentUser(token)).uri
  }

  try {
    const eventTypes = await listEventTypes(token, userUri)
    return NextResponse.json({ eventTypes, selected: profile?.calendly_event_type_uri ?? null })
  } catch (err) {
    return NextResponse.json({ error: "calendly_error", message: (err as Error).message }, { status: 502 })
  }
}

export async function PATCH(req: NextRequest) {
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })

  const body = await req.json().catch(() => null) as { uri?: unknown } | null
  const uri = typeof body?.uri === "string" ? body.uri : ""
  if (!uri) return NextResponse.json({ error: "missing_uri" }, { status: 400 })

  const admin = getAdminSupabase()
  const token = await getValidAccessToken(admin, user.id)
  if (!token) return NextResponse.json({ error: "not_connected" }, { status: 400 })

  const { data: profile } = await admin
    .from("profiles")
    .select("calendly_user_uri")
    .eq("user_id", user.id)
    .single()
  const userUri = profile?.calendly_user_uri ?? (await getCurrentUser(token)).uri

  // Validate the chosen URI belongs to this client, and grab its scheduling URL.
  const eventTypes = await listEventTypes(token, userUri)
  const chosen = eventTypes.find((e) => e.uri === uri)
  if (!chosen) return NextResponse.json({ error: "invalid_uri" }, { status: 400 })

  await admin.from("profiles").update({
    calendly_event_type_uri: chosen.uri,
    calendly_scheduling_url: chosen.schedulingUrl,
  }).eq("user_id", user.id)

  return NextResponse.json({ ok: true, selected: chosen })
}
