/**
 * POST /api/candidates/:id/match-all
 *
 * Auto-matching d'un nouveau candidat contre tous les postes "open" du user.
 * Appelé en fire-and-forget par la route /api/cv/:id/parse une fois le
 * parsing terminé. Peut aussi être déclenché manuellement depuis l'UI.
 *
 * Coût : 1 appel LLM par poste qui passe le pré-filtre déterministe. Avec
 * 1-5 postes ouverts typiques c'est négligeable. La quota d'usage est
 * consommée comme "match" (1 action), pas par poste — c'est UN run de
 * matching pour le sourceur.
 */

import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { requireActiveAccess } from "@/lib/access-guard"
import { getAdminSupabase } from "@/lib/admin-supabase"
import {
  prefilterCandidates,
  scoreBatchCriteria,
  missionTagFor,
  withMissionTag,
} from "@/lib/matching"
import { consumeQuota, consumeOrgLlmActionForUser } from "@/lib/quota"
import type { Criterion } from "@/lib/job-criteria-catalog"
import { CANDIDATE_COLUMNS, type Candidate, type Job, type Database } from "@/lib/database.types"

type MatchInsert = Database["public"]["Tables"]["match_assessments"]["Insert"]

export const runtime = "nodejs"
export const maxDuration = 60

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })
  const gate = await requireActiveAccess()
  if (!gate.ok) return gate.response

  // RLS-scoped read to verify ownership before doing any admin work.
  const { data: candRow, error: candErr } = await sb
    .from("candidates").select(CANDIDATE_COLUMNS).eq("id", id).single()
  if (candErr || !candRow) return NextResponse.json({ error: "not_found" }, { status: 404 })
  const candidate = candRow as unknown as Candidate
  if (candidate.parse_status !== "parsed") {
    return NextResponse.json({ ok: true, scored: 0, reason: "not_parsed" })
  }

  const admin = getAdminSupabase()

  // Open jobs only — drafts, filled, archived are out of scope for auto-matching.
  const { data: jobsRaw } = await sb
    .from("jobs").select("*").eq("status", "open").limit(50)
  const jobs = (jobsRaw ?? []) as Job[]
  if (jobs.length === 0) return NextResponse.json({ ok: true, scored: 0, jobs: 0 })

  const quota = await consumeQuota(admin, user.id, "match")
  if (!quota.ok) {
    return NextResponse.json({ error: "quota_exceeded", message: quota.message }, { status: 429 })
  }
  const orgLlm = await consumeOrgLlmActionForUser(admin, user.id)
  if (!orgLlm.ok) {
    return NextResponse.json({ error: orgLlm.code ?? "llm_quota_exceeded", message: orgLlm.message }, { status: 429 })
  }

  let scored = 0
  let inserted = 0

  for (const job of jobs) {
    // PR-Z : on saute les missions qui n'ont pas encore leurs critères
    // configurés. Le scoring auto-discovery ne doit pas créer de matchs
    // muets — on attend que le sourceur ait fait l'onboarding critères.
    const criteria = (job.criteria ?? []) as Criterion[]
    if (!job.criteria_locked_at || criteria.length === 0) continue

    // Per-job deterministic pre-filter on this single candidate.
    const hits = prefilterCandidates(job.normalized ?? {}, [candidate])
    if (hits.length === 0) continue

    let results
    try {
      results = await scoreBatchCriteria(job, criteria, [candidate])
    } catch (err) {
      console.error("[match-all] batch failed for job", job.id, (err as Error).message)
      continue
    }
    if (results.length === 0) continue
    const r = results[0]
    scored += 1

    // Upsert assessment — preserve any existing pipeline_stage.
    const { data: existing } = await admin
      .from("match_assessments")
      .select("id").eq("job_id", job.id).eq("candidate_id", candidate.id).maybeSingle()

    if (existing) {
      await admin.from("match_assessments").update({
        score: r.score,
        criteria_eval: r.criteria_eval,
        match_tier: r.tier,
      }).eq("id", existing.id)
    } else {
      const insert: MatchInsert = {
        user_id: user.id,
        job_id: job.id,
        candidate_id: candidate.id,
        score: r.score,
        criteria_eval: r.criteria_eval,
        match_tier: r.tier,
        pipeline_stage: "identified",
        source: "vivier_matched",
      }
      await admin.from("match_assessments").insert(insert)
      inserted += 1
    }

    // Mission tag write-back on good/excellent matches.
    if (r.tier === "excellent" || r.tier === "good") {
      const nextTax = withMissionTag(candidate.taxonomy, missionTagFor(job))
      if (nextTax !== candidate.taxonomy) {
        await admin.from("candidates").update({ taxonomy: nextTax }).eq("id", candidate.id)
      }
    }
  }

  return NextResponse.json({ ok: true, jobs: jobs.length, scored, inserted })
}
