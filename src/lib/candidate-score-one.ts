/**
 * Cœur du scoring candidat × mission — extrait de POST /api/match/score-one
 * (Slice 6.1) pour être appelé AUSSI par la route publique de candidature,
 * sans session authentifiée. Comportement inchangé ; la route existante est
 * redevenue un wrapper fin (auth + quota + appel de cette fonction).
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { scoreBatchCriteria, withMissionTag, missionTagFor } from "./matching"
import type { Criterion } from "./job-criteria-catalog"
import type { Candidate, Job, Database } from "./database.types"

type MatchInsert = Database["public"]["Tables"]["match_assessments"]["Insert"]
type MatchRow = Database["public"]["Tables"]["match_assessments"]["Row"]

export type ScoreOneOutcome =
  | { kind: "candidate_not_parsed" }
  | { kind: "criteria_not_configured" }
  | { kind: "scoring_failed"; detail: string }
  | { kind: "no_result" }
  | { kind: "success"; match: MatchRow; score: number; tier: string | null }

export async function scoreOneCandidate(
  admin: SupabaseClient<Database>,
  params: {
    candidate: Candidate
    job: Job
    /** Attribué au match — le propriétaire de la mission pour une
     *  candidature publique (pas de session, pas d'"acteur" réel). */
    userId: string
    source: "applied" | "uploaded" | "vivier_matched" | "vivier_assigned"
    lang?: "fr" | "en"
  },
): Promise<ScoreOneOutcome> {
  const { candidate, job, userId, source } = params
  const lang = params.lang ?? "fr"

  if (candidate.parse_status !== "parsed") {
    return { kind: "candidate_not_parsed" }
  }

  const criteria = (job.criteria ?? []) as Criterion[]
  if (!job.criteria_locked_at || criteria.length === 0) {
    return { kind: "criteria_not_configured" }
  }

  let results
  try {
    results = await scoreBatchCriteria(job, criteria, [candidate], lang)
  } catch (err) {
    return { kind: "scoring_failed", detail: (err as Error).message }
  }
  if (results.length === 0) {
    return { kind: "no_result" }
  }
  const r = results[0]!

  const { data: existing } = await admin
    .from("match_assessments")
    .select("id")
    .eq("job_id", job.id)
    .eq("candidate_id", candidate.id)
    .maybeSingle()

  let matchRow: MatchRow | null = null
  if (existing) {
    const { data } = await admin
      .from("match_assessments")
      .update({ score: r.score, criteria_eval: r.criteria_eval, match_tier: r.tier, source })
      .eq("id", existing.id)
      .select("*")
      .single()
    matchRow = data
  } else {
    const insert: MatchInsert = {
      user_id: userId,
      job_id: job.id,
      candidate_id: candidate.id,
      score: r.score,
      criteria_eval: r.criteria_eval,
      match_tier: r.tier,
      pipeline_stage: "identified",
      source,
    }
    const { data } = await admin.from("match_assessments").insert(insert).select("*").single()
    matchRow = data
  }

  if (!matchRow) return { kind: "no_result" }

  if (r.tier === "excellent" || r.tier === "good") {
    const nextTax = withMissionTag(candidate.taxonomy, missionTagFor(job))
    if (nextTax !== candidate.taxonomy) {
      await admin.from("candidates").update({ taxonomy: nextTax }).eq("id", candidate.id)
    }
  }

  return { kind: "success", match: matchRow, score: r.score, tier: r.tier }
}
