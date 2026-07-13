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
import { requireActiveAccess } from "@/lib/access-guard"
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
      salary_expectation_brut,
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

/**
 * PATCH /api/match/:id
 *
 * Met à jour des champs UNIVERSELS du match (indépendants de la Suite
 * Pricing). Pour l'instant : la prétention salariale du candidat, saisie sur
 * la fiche match. Field-allowlist stricte + RLS-scoped (le client Supabase
 * server est org-scopé → un match d'une autre org ne matchera pas).
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })
  const gate = await requireActiveAccess()
  if (!gate.ok) return gate.response

  const body = await req.json().catch(() => null) as Record<string, unknown> | null

  // Allowlist : uniquement la prétention salariale (entier ≥ 0, ou null pour
  // effacer). On ignore tout autre champ du body.
  const update: { salary_expectation_brut?: number | null } = {}
  if (body && "salary_expectation_brut" in body) {
    const v = body.salary_expectation_brut
    if (v === null || v === "") {
      update.salary_expectation_brut = null
    } else {
      const n = typeof v === "number" ? v : Number(v)
      if (!Number.isFinite(n) || n < 0) {
        return NextResponse.json({ error: "invalid_salary" }, { status: 400 })
      }
      update.salary_expectation_brut = Math.round(n)
    }
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "no_op" }, { status: 400 })
  }

  const { data, error } = await sb
    .from("match_assessments")
    .update(update)
    .eq("id", id)
    .select("id, salary_expectation_brut")
    .single()
  if (error || !data) return NextResponse.json({ error: "not_found" }, { status: 404 })

  return NextResponse.json({ ok: true, match: data })
}
