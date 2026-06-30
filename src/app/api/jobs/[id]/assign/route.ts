/**
 * POST /api/jobs/:id/assign   { candidate_id }
 *
 * Assignation manuelle d'un candidat à un poste — pour les cas où le
 * matching auto a écarté ou pas remonté un profil que le sourceur veut
 * quand même pousser dans le pipeline (ex : recommandation hors algo).
 *
 * Pas d'appel LLM, pas de score. Le candidat apparaît dans le kanban
 * avec score = null + justification "Assigné manuellement", ce qui le
 * fait sortir du filtre de score (score >= 60) côté pipeline.
 */

import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { getAdminSupabase } from "@/lib/admin-supabase"
import type { Database } from "@/lib/database.types"

type MatchInsert = Database["public"]["Tables"]["match_assessments"]["Insert"]

export const runtime = "nodejs"

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: jobId } = await ctx.params
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })

  const body = await req.json().catch(() => null) as { candidate_id?: unknown } | null
  const candidateId = typeof body?.candidate_id === "string" ? body.candidate_id : null
  if (!candidateId) return NextResponse.json({ error: "candidate_id_required" }, { status: 400 })

  // Verify both belong to the user via RLS-scoped reads.
  const [{ data: job }, { data: cand }] = await Promise.all([
    sb.from("jobs").select("id").eq("id", jobId).maybeSingle(),
    sb.from("candidates").select("id").eq("id", candidateId).maybeSingle(),
  ])
  if (!job)  return NextResponse.json({ error: "job_not_found" }, { status: 404 })
  if (!cand) return NextResponse.json({ error: "candidate_not_found" }, { status: 404 })

  const admin = getAdminSupabase()
  const { data: existing } = await admin
    .from("match_assessments")
    .select("id")
    .eq("job_id", jobId).eq("candidate_id", candidateId)
    .maybeSingle()

  if (existing) {
    // Already matched — nothing to do, just surface it.
    return NextResponse.json({ ok: true, already: true, id: existing.id })
  }

  const insert: MatchInsert = {
    user_id: user.id,
    job_id: jobId,
    candidate_id: candidateId,
    score: null,
    score_dimensions: null,
    justification: "Assigné manuellement par le sourceur.",
    match_tier: null,
    pipeline_stage: "identified",
    // Assignation manuelle = choix explicite → entre direct dans la pipeline.
    in_pipeline: true,
    source: "vivier_assigned",
  }
  const { data: inserted, error } = await admin
    .from("match_assessments").insert(insert).select("id").single()
  if (error) {
    return NextResponse.json({ error: "insert_failed", detail: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, id: inserted.id })
}
