/**
 * POST /api/match/score-one  body: { candidate_id, job_id }
 *
 * Score un SEUL candidat contre une SEULE mission, en utilisant le même
 * pipeline LLM que /api/jobs/[id]/match (cf. lib/matching.ts).
 *
 * Cas d'usage :
 *   - Le sourceur dépose un CV directement sur la page mission (E1) →
 *     on score immédiatement après le parse au lieu d'attendre un
 *     "Matcher le vivier" complet.
 *   - Plus tard : le formulaire de candidature publique (E2) appelle
 *     aussi cette route quand un candidat postule à une mission.
 *
 * Upsert sur match_assessments : si une row existe déjà pour ce
 * couple (job_id, candidate_id), elle est mise à jour.
 */

import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { requireActiveAccess } from "@/lib/access-guard"
import { getAdminSupabase } from "@/lib/admin-supabase"
import { consumeOrgLlmActionForUser } from "@/lib/quota"
import { scoreBatchCriteria, withMissionTag, missionTagFor } from "@/lib/matching"
import type { Criterion } from "@/lib/job-criteria-catalog"
import { CANDIDATE_COLUMNS, type Candidate, type Job, type Database } from "@/lib/database.types"

type MatchInsert = Database["public"]["Tables"]["match_assessments"]["Insert"]

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
  // E1 (modale upload mission) envoie source="uploaded". E2 (formulaire
  // public, à venir) enverra source="applied". Défaut "uploaded" puisque
  // cette route n'est aujourd'hui appelée que par E1.
  const sourceParam = typeof body?.source === "string" ? body.source : "uploaded"
  const source: "applied" | "uploaded" =
    sourceParam === "applied" ? "applied" : "uploaded"

  // RLS-scoped reads pour vérifier que les deux appartiennent à l'org.
  const [{ data: candRow }, { data: jobRow }] = await Promise.all([
    sb.from("candidates").select(CANDIDATE_COLUMNS).eq("id", candidateId).maybeSingle(),
    sb.from("jobs").select("*").eq("id", jobId).maybeSingle(),
  ])
  if (!candRow) return NextResponse.json({ error: "candidate_not_found" }, { status: 404 })
  if (!jobRow) return NextResponse.json({ error: "job_not_found" }, { status: 404 })

  const candidate = candRow as unknown as Candidate
  const job = jobRow as Job
  if (candidate.parse_status !== "parsed") {
    return NextResponse.json({
      error: "candidate_not_parsed",
      message: "Le candidat n'est pas encore parsé.",
    }, { status: 400 })
  }

  // PR-Z : on a besoin de critères configurés pour scorer.
  const criteria = (job.criteria ?? []) as Criterion[]
  if (!job.criteria_locked_at || criteria.length === 0) {
    return NextResponse.json({
      error: "criteria_not_configured",
      message: "Configure les critères de la mission avant d'importer des candidats.",
    }, { status: 400 })
  }

  const orgLlm = await consumeOrgLlmActionForUser(getAdminSupabase(), user.id)
  if (!orgLlm.ok) {
    return NextResponse.json(
      { error: orgLlm.code ?? "llm_quota_exceeded", message: orgLlm.message },
      { status: 429 },
    )
  }

  let results
  try {
    results = await scoreBatchCriteria(job, criteria, [candidate], lang)
  } catch (err) {
    return NextResponse.json(
      { error: "scoring_failed", detail: (err as Error).message },
      { status: 502 },
    )
  }
  if (results.length === 0) {
    return NextResponse.json({
      error: "no_result",
      message: "Nora n'a pas pu scorer ce candidat.",
    }, { status: 502 })
  }
  const r = results[0]

  const admin = getAdminSupabase()
  const { data: existing } = await admin
    .from("match_assessments")
    .select("id")
    .eq("job_id", jobId)
    .eq("candidate_id", candidateId)
    .maybeSingle()

  let matchRow
  if (existing) {
    // L'action explicite du sourceur (upload / candidature) prime sur la
    // source historique : on écrase la source même en UPDATE.
    const { data } = await admin
      .from("match_assessments")
      .update({
        score: r.score,
        criteria_eval: r.criteria_eval,
        match_tier: r.tier,
        source,
      })
      .eq("id", existing.id)
      .select("*")
      .single()
    matchRow = data
  } else {
    const insert: MatchInsert = {
      user_id: user.id,
      job_id: jobId,
      candidate_id: candidateId,
      score: r.score,
      criteria_eval: r.criteria_eval,
      match_tier: r.tier,
      pipeline_stage: "identified",
      source,
    }
    const { data } = await admin
      .from("match_assessments")
      .insert(insert)
      .select("*")
      .single()
    matchRow = data
  }

  // Mission tag write-back si bon match (cohérent avec le matching vivier).
  if (r.tier === "excellent" || r.tier === "good") {
    const nextTax = withMissionTag(candidate.taxonomy, missionTagFor(job))
    if (nextTax !== candidate.taxonomy) {
      await admin.from("candidates").update({ taxonomy: nextTax }).eq("id", candidate.id)
    }
  }

  return NextResponse.json({ ok: true, match: matchRow, result: r })
}
