/**
 * POST /api/jobs/:id/feedback-dismiss   (lot 3c v3)
 *
 * Avance le filigrane `feedback_consumed_until` SANS toucher aux critères :
 * quand Nora ne recommande aucun changement pour des retours client, le
 * sourceur clique « OK, ne plus me le proposer » → on marque ces retours comme
 * traités pour qu'ils ne re-déclenchent plus la bannière. Aucun re-matching,
 * aucune modification de critères (donc pas de fausse bannière « critères
 * modifiés »).
 */

import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { requireActiveAccess } from "@/lib/access-guard"
import { getAdminSupabase } from "@/lib/admin-supabase"

export const runtime = "nodejs"

function sanitizeIso(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const t = new Date(raw).getTime()
  return Number.isFinite(t) ? new Date(t).toISOString() : null
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })
  const gate = await requireActiveAccess()
  if (!gate.ok) return gate.response

  const body = await req.json().catch(() => null) as { watermark?: unknown } | null
  const watermark = sanitizeIso(body?.watermark)
  if (!watermark) return NextResponse.json({ error: "bad_request" }, { status: 400 })

  // RLS-scoped ownership + filigrane courant (ne jamais reculer).
  const { data: jobRow } = await sb
    .from("jobs")
    .select("id, feedback_consumed_until")
    .eq("id", id)
    .maybeSingle()
  if (!jobRow) return NextResponse.json({ error: "not_found" }, { status: 404 })

  const prevMs = jobRow.feedback_consumed_until ? new Date(jobRow.feedback_consumed_until).getTime() : 0
  if (new Date(watermark).getTime() <= prevMs) {
    return NextResponse.json({ ok: true, feedback_consumed_until: jobRow.feedback_consumed_until })
  }

  const admin = getAdminSupabase()
  const { error } = await admin.from("jobs").update({ feedback_consumed_until: watermark }).eq("id", id)
  if (error) {
    console.error("[jobs/:id/feedback-dismiss] update failed:", error.message)
    return NextResponse.json({ error: "update_failed", detail: "internal_error" }, { status: 500 })
  }
  return NextResponse.json({ ok: true, feedback_consumed_until: watermark })
}
