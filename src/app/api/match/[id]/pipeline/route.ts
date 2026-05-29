/**
 * PATCH /api/match/:id/pipeline   { in_pipeline: boolean }
 *
 * Adds a matched candidate to the sourceur's pipeline (or removes them).
 * The pipeline is a *curated* list — a match assessment exists for every
 * scored candidate, but it only shows in the kanban when in_pipeline=true.
 *
 * Adding sends the candidate to the "identified" stage (entry point).
 * Removing simply hides them from the pipeline; the assessment + score stay.
 */

import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import type { Database } from "@/lib/database.types"

export const runtime = "nodejs"

type MatchUpdate = Database["public"]["Tables"]["match_assessments"]["Update"]

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })

  const body = await req.json().catch(() => null) as { in_pipeline?: unknown } | null
  if (typeof body?.in_pipeline !== "boolean") {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 })
  }
  const inPipeline = body.in_pipeline

  // RLS-scoped read confirms ownership (→ 404 if not owner).
  const { data: row, error: fetchErr } = await sb
    .from("match_assessments")
    .select("id, pipeline_stage")
    .eq("id", id)
    .single()
  if (fetchErr || !row) return NextResponse.json({ error: "not_found" }, { status: 404 })

  const update: MatchUpdate = { in_pipeline: inPipeline }
  // When adding, anchor at the entry stage unless the card is already further
  // along (defensive — shouldn't happen for a fresh add).
  if (inPipeline && (row.pipeline_stage === "identified" || row.pipeline_stage === "pricing")) {
    update.pipeline_stage = "identified"
  }

  const { data: updated, error: updateErr } = await sb
    .from("match_assessments")
    .update(update)
    .eq("id", id)
    .select("*")
    .single()

  if (updateErr) {
    return NextResponse.json({ error: "db_update_failed", detail: updateErr.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, assessment: updated })
}
