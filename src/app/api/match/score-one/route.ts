/**
 * POST /api/match/score-one  body: { candidate_id, job_id }
 *
 * Score un SEUL candidat contre une SEULE mission — wrapper authentifié
 * autour de lib/candidate-score-one.ts (extrait en Slice 6.1 pour que la
 * route publique de candidature appelle le même code sans session).
 *
 * Cas d'usage :
 *   - Le sourceur dépose un CV directement sur la page mission (E1).
 *   - Le formulaire de candidature publique (E2 / Slice 6.1) appelle
 *     lib/candidate-score-one.ts directement, pas cette route (pas de
 *     session à présenter, pas de quota utilisateur à consommer côté
 *     candidat).
 *
 * Upsert sur match_assessments : si une row existe déjà pour ce
 * couple (job_id, candidate_id), elle est mise à jour.
 */

import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { requireActiveAccess } from "@/lib/access-guard"
import { getAdminSupabase } from "@/lib/admin-supabase"
import { consumeOrgLlmActionForUser } from "@/lib/quota"
import { scoreOneCandidate } from "@/lib/candidate-score-one"
import { CANDIDATE_COLUMNS, type Candidate, type Job } from "@/lib/database.types"

export const runtime = "nodejs"
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })
  const gate = await requireActiveAccess()
  if (!gate.ok) return gate.response

  const body = await req.json().catch(() => null) as
    { candidate_id?: unknown; job_id?: unknown; source?: unknown; lang?: unknown } | null
  const candidateId = typeof body?.candidate_id === "string" ? body.candidate_id : null
  const jobId = typeof body?.job_id === "string" ? body.job_id : null
  if (!candidateId || !jobId) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 })
  }
  const lang: "fr" | "en" = body?.lang === "en" ? "en" : "fr"
  const sourceParam = typeof body?.source === "string" ? body.source : "uploaded"
  const source: "applied" | "uploaded" = sourceParam === "applied" ? "applied" : "uploaded"

  const [{ data: candRow }, { data: jobRow }] = await Promise.all([
    sb.from("candidates").select(CANDIDATE_COLUMNS).eq("id", candidateId).maybeSingle(),
    sb.from("jobs").select("*").eq("id", jobId).maybeSingle(),
  ])
  if (!candRow) return NextResponse.json({ error: "candidate_not_found" }, { status: 404 })
  if (!jobRow) return NextResponse.json({ error: "job_not_found" }, { status: 404 })

  const orgLlm = await consumeOrgLlmActionForUser(getAdminSupabase(), user.id)
  if (!orgLlm.ok) {
    return NextResponse.json(
      { error: orgLlm.code ?? "llm_quota_exceeded", message: orgLlm.message },
      { status: 429 },
    )
  }

  const outcome = await scoreOneCandidate(getAdminSupabase(), {
    candidate: candRow as unknown as Candidate,
    job: jobRow as Job,
    userId: user.id,
    source,
    lang,
  })

  switch (outcome.kind) {
    case "candidate_not_parsed":
      return NextResponse.json({
        error: "candidate_not_parsed",
        message: "Le candidat n'est pas encore parsé.",
      }, { status: 400 })
    case "criteria_not_configured":
      return NextResponse.json({
        error: "criteria_not_configured",
        message: "Configure les critères de la mission avant d'importer des candidats.",
      }, { status: 400 })
    case "scoring_failed":
      return NextResponse.json({ error: "scoring_failed", detail: outcome.detail }, { status: 502 })
    case "no_result":
      return NextResponse.json({
        error: "no_result",
        message: "Nora n'a pas pu scorer ce candidat.",
      }, { status: 502 })
    case "success":
      return NextResponse.json({
        ok: true,
        match: outcome.match,
        result: { score: outcome.score, tier: outcome.tier },
      })
  }
}
