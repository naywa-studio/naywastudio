/**
 * POST /api/calendly/webhook   — Calendly invitee webhook.
 *
 * Fires when a candidate books (`invitee.created`) or cancels
 * (`invitee.canceled`) through a client's embedded Calendly widget. We:
 *   1. Verify the Calendly signature.
 *   2. Resolve the host client via the scheduled event's membership.
 *   3. Resolve the candidate/job/match via the booking token (utm_content),
 *      falling back to the invitee email.
 *   4. Upsert the interview, and move the pipeline card to "Entretien".
 *
 * The booking is a factual event (a confirmed slot), so it advances the
 * pipeline directly — unlike untrusted inbound email, which only suggests.
 */

import { NextRequest, NextResponse } from "next/server"
import { getAdminSupabase } from "@/lib/admin-supabase"
import { verifyWebhookSignature } from "@/lib/calendly"

export const runtime = "nodejs"
export const maxDuration = 30

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null
}

/** Extract the host's Calendly user URI from the scheduled event memberships. */
function hostUserUri(scheduledEvent: Record<string, unknown>): string | null {
  const memberships = scheduledEvent.event_memberships
  if (!Array.isArray(memberships)) return null
  for (const m of memberships) {
    if (m && typeof m === "object") {
      const u = str((m as Record<string, unknown>).user)
      if (u) return u
    }
  }
  return null
}

interface ParsedLocation {
  locationType: string | null
  joinUrl: string | null
  locationText: string | null
}
function parseLocation(location: unknown): ParsedLocation {
  if (!location || typeof location !== "object") {
    return { locationType: null, joinUrl: null, locationText: null }
  }
  const l = location as Record<string, unknown>
  return {
    locationType: str(l.type),
    joinUrl: str(l.join_url),
    locationText: str(l.location) ?? str(l.additional_info),
  }
}

export async function POST(req: NextRequest) {
  const raw = await req.text()
  if (!verifyWebhookSignature(raw, req.headers.get("calendly-webhook-signature"))) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 })
  }

  let body: { event?: string; payload?: Record<string, unknown> }
  try {
    body = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 })
  }

  const event = body.event ?? ""
  const payload = body.payload ?? {}
  const admin = getAdminSupabase()

  const scheduledEvent = (payload.scheduled_event ?? {}) as Record<string, unknown>
  const eventUri = str(scheduledEvent.uri)
  if (!eventUri) return NextResponse.json({ ok: true, ignored: true })

  // ── invitee.canceled — mark the interview canceled, leave the kanban alone ──
  if (event === "invitee.canceled") {
    const cancellation = (payload.cancellation ?? {}) as Record<string, unknown>
    await admin.from("interviews").update({
      status: "canceled",
      canceled_at: new Date().toISOString(),
      cancel_reason: str(cancellation.reason),
    }).eq("calendly_event_uri", eventUri)
    return NextResponse.json({ ok: true })
  }

  if (event !== "invitee.created") {
    return NextResponse.json({ ok: true, ignored: true })
  }

  // ── invitee.created ──
  // 1. Host client
  const hostUri = hostUserUri(scheduledEvent)
  if (!hostUri) return NextResponse.json({ ok: true, ignored: true })

  const { data: profile } = await admin
    .from("profiles")
    .select("user_id")
    .eq("calendly_user_uri", hostUri)
    .maybeSingle()
  if (!profile) return NextResponse.json({ ok: true, ignored: true })
  const userId = profile.user_id

  // 2. Candidate / job / match — via booking token, fallback to invitee email
  const tracking = (payload.tracking ?? {}) as Record<string, unknown>
  const bookingToken = str(tracking.utm_content)
  const inviteeEmail = str(payload.email)

  let candidateId: string | null = null
  let jobId: string | null = null
  let matchId: string | null = null

  if (bookingToken) {
    const { data: match } = await admin
      .from("match_assessments")
      .select("id, candidate_id, job_id")
      .eq("booking_token", bookingToken)
      .eq("user_id", userId)
      .maybeSingle()
    if (match) {
      matchId = match.id
      candidateId = match.candidate_id
      jobId = match.job_id
    }
  }
  if (!candidateId && inviteeEmail) {
    const { data: candidate } = await admin
      .from("candidates")
      .select("id")
      .eq("user_id", userId)
      .ilike("email", inviteeEmail)
      .limit(1)
      .maybeSingle()
    candidateId = candidate?.id ?? null
  }

  // 3. Upsert the interview
  const loc = parseLocation(scheduledEvent.location)
  const { error: upsertError } = await admin.from("interviews").upsert({
    user_id: userId,
    candidate_id: candidateId,
    job_id: jobId,
    match_id: matchId,
    calendly_event_uri: eventUri,
    calendly_invitee_uri: str(payload.uri),
    status: "scheduled",
    start_time: str(scheduledEvent.start_time) ?? new Date().toISOString(),
    end_time: str(scheduledEvent.end_time) ?? new Date().toISOString(),
    location_type: loc.locationType,
    join_url: loc.joinUrl,
    location_text: loc.locationText,
    invitee_name: str(payload.name),
    invitee_email: inviteeEmail,
    canceled_at: null,
    cancel_reason: null,
  }, { onConflict: "calendly_event_uri" })

  if (upsertError) {
    console.error("[calendly webhook] interview upsert failed:", upsertError.message)
    return NextResponse.json({ error: "db_error" }, { status: 500 })
  }

  // 4. Advance the pipeline card — a confirmed booking is a factual interview
  if (matchId) {
    const { data: match } = await admin
      .from("match_assessments")
      .select("pipeline_stage")
      .eq("id", matchId)
      .maybeSingle()
    // Only move forward; don't pull a card back from offer/hired.
    const advanceable = ["identified", "contacted", "replied"]
    if (match && advanceable.includes(match.pipeline_stage)) {
      await admin.from("match_assessments").update({
        pipeline_stage: "interview",
        interview_at: str(scheduledEvent.start_time),
      }).eq("id", matchId)
    }
  }

  return NextResponse.json({ ok: true, matched: !!matchId })
}
