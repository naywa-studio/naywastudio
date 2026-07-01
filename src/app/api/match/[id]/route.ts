/**
 * GET /api/match/:id
 *
 * Renvoie le match_assessment + le candidat (colonnes UI) + le poste
 * joints en un seul appel. Sert principalement de feeder à la nouvelle
 * fiche match `/workspace/match/[matchId]` qui agrège tout au même endroit.
 *
 * RLS-scoped read: si le match n'appartient pas au user, on renvoie 404.
 */

import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { CANDIDATE_COLUMNS } from "@/lib/database.types"

export const runtime = "nodejs"

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })

  const { data: match, error } = await sb
    .from("match_assessments")
    .select(`
      id, user_id, candidate_id, job_id,
      score, score_dimensions, criteria_eval, justification, match_tier, source,
      pipeline_stage, in_pipeline, contacted_at, replied_at, interview_at,
      booking_token, created_at, updated_at,
      job:jobs(*)
    `)
    .eq("id", id)
    .single()

  if (error || !match) return NextResponse.json({ error: "not_found" }, { status: 404 })

  const { data: candRow } = await sb
    .from("candidates")
    .select(CANDIDATE_COLUMNS)
    .eq("id", match.candidate_id)
    .single()
  if (!candRow) return NextResponse.json({ error: "candidate_not_found" }, { status: 404 })

  return NextResponse.json({ match, candidate: candRow })
}
