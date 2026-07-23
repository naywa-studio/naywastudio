/**
 * PATCH /api/match/:id/stage   { pipeline_stage }
 *
 * Moves a match assessment to a new pipeline stage and stamps the relevant
 * milestone timestamp (contacted_at / replied_at / interview_at) the first
 * time that stage is reached.
 */

import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { requireActiveAccess } from "@/lib/access-guard"
import type { Database, PipelineStage } from "@/lib/database.types"
import { REJECT_REASON_OPTIONS, type RejectReason } from "@/lib/reject-reasons"

const REJECT_REASON_VALUES = new Set<string>(REJECT_REASON_OPTIONS.map((o) => o.value))

export const runtime = "nodejs"

type MatchUpdate = Database["public"]["Tables"]["match_assessments"]["Update"]

// Order matters — used below to decide which milestone timestamps to stamp
// when a card jumps forward through the pipeline. 'pricing' sits between
// 'identified' and 'contacted'; it has no dedicated timestamp because the
// chiffrage doesn't need one (the data lives on the upcoming match_pricing
// table). 'rejected' is terminal, reachable from any stage.
const STAGES: PipelineStage[] = [
  "identified", "pricing", "contacted", "replied", "interview", "offer", "hired", "rejected",
]

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })
  const gate = await requireActiveAccess()
  if (!gate.ok) return gate.response

  const body = await req.json().catch(() => null) as {
    pipeline_stage?: unknown
    reject_reason?: unknown
    reject_reason_note?: unknown
  } | null
  const stage = body?.pipeline_stage
  if (typeof stage !== "string" || !STAGES.includes(stage as PipelineStage)) {
    return NextResponse.json({ error: "invalid_stage" }, { status: 400 })
  }

  // Raison de rejet : optionnelle, acceptée seulement quand on passe à
  // 'rejected'. Sur n'importe quelle autre transition, on nettoie le champ
  // pour ne pas garder une raison périmée (ex. rejected → contacted).
  let rejectReason: RejectReason | null = null
  let rejectReasonNote: string | null = null
  if (stage === "rejected") {
    if (typeof body?.reject_reason === "string" && REJECT_REASON_VALUES.has(body.reject_reason)) {
      rejectReason = body.reject_reason as RejectReason
    }
    if (typeof body?.reject_reason_note === "string") {
      const trimmed = body.reject_reason_note.trim()
      if (trimmed.length > 0 && trimmed.length <= 280) rejectReasonNote = trimmed
    }
  }

  // RLS-scoped read confirms ownership.
  const { data: row, error: fetchErr } = await sb
    .from("match_assessments")
    .select("id, contacted_at, replied_at, interview_at")
    .eq("id", id)
    .single()
  if (fetchErr || !row) return NextResponse.json({ error: "not_found" }, { status: 404 })

  const now = new Date().toISOString()
  // Déplacer une carte dans le kanban implique qu'elle est suivie.
  const update: MatchUpdate = { pipeline_stage: stage as PipelineStage, in_pipeline: true }

  // Persiste la raison quand on passe à 'rejected', et la nettoie sinon
  // (ressortir un rejet → on jette la raison pour éviter un fossile).
  if (stage === "rejected") {
    update.reject_reason = rejectReason
    update.reject_reason_note = rejectReasonNote
  } else {
    update.reject_reason = null
    update.reject_reason_note = null
  }

  // Stamp the milestone the first time a stage is reached. Reaching a later
  // stage also back-fills earlier milestones that were skipped.
  const reachedIdx = STAGES.indexOf(stage as PipelineStage)
  if (reachedIdx >= STAGES.indexOf("contacted") && reachedIdx <= STAGES.indexOf("offer")) {
    if (!row.contacted_at) update.contacted_at = now
  }
  if (reachedIdx >= STAGES.indexOf("replied") && reachedIdx <= STAGES.indexOf("offer")) {
    if (!row.replied_at) update.replied_at = now
  }
  if (reachedIdx >= STAGES.indexOf("interview") && reachedIdx <= STAGES.indexOf("offer")) {
    if (!row.interview_at) update.interview_at = now
  }

  const { data: updated, error: updateErr } = await sb
    .from("match_assessments")
    .update(update)
    .eq("id", id)
    .select("*")
    .single()

  if (updateErr) {
    console.error("[match/stage] db update failed:", updateErr.message)
    return NextResponse.json({ error: "db_update_failed", detail: "internal_error" }, { status: 500 })
  }
  return NextResponse.json({ ok: true, assessment: updated })
}
