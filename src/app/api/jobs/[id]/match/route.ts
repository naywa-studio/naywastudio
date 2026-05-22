/**
 * POST /api/jobs/:id/match
 *
 * Runs the matching engine for a job:
 *   1. Load the caller's parsed candidates.
 *   2. Deterministic pre-filter on taxonomy overlap (free, instant).
 *   3. Score the plausible pool with the LLM, in small batches, seeing
 *      only structured tags — never the raw CV.
 *   4. Upsert match_assessments (preserving pipeline_stage on existing rows).
 *   5. Write a normalized mission tag back onto well-matched candidates'
 *      taxonomy — the vivier remembers.
 *
 * Re-runnable: re-scoring a job refreshes scores/justifications but keeps
 * each candidate's pipeline stage intact.
 */

import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { getAdminSupabase } from "@/lib/admin-supabase"
import {
  prefilterCandidates,
  scoreBatch,
  missionTagFor,
  withMissionTag,
  MATCH_BATCH_SIZE,
  type MatchResult,
} from "@/lib/matching"
import { consumeQuota } from "@/lib/quota"
import { CANDIDATE_COLUMNS, type Candidate, type Job, type Database } from "@/lib/database.types"

type MatchInsert = Database["public"]["Tables"]["match_assessments"]["Insert"]

export const runtime = "nodejs"
export const maxDuration = 60

// Hard ceiling per run so a huge vivier can't blow the 60s function budget
// (≈ batches * 5-8s LLM call + DB writes). The pre-filter sorts by relevance
// signal, so the best candidates are always covered first; the user can re-run.
// 40 / MATCH_BATCH_SIZE(8) = 5 LLM round-trips, which leaves margin even when
// OpenRouter is slow.
const MAX_SCORED_PER_RUN = 40

/**
 * If a previous run was killed mid-flight by Vercel (timeout, OOM, deploy),
 * the `match_status='matching'` flag is never cleared because no catch block
 * runs on a hard kill. We treat any "matching" older than 2 minutes as stale
 * and reset it so the sourceur can retry without manual DB surgery.
 */
const STALE_MATCHING_AFTER_MS = 2 * 60_000

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })

  const { data: job, error: jobErr } = await sb.from("jobs").select("*").eq("id", id).single()
  if (jobErr || !job) return NextResponse.json({ error: "not_found" }, { status: 404 })

  const admin = getAdminSupabase()

  // Recover from a previous run killed by Vercel mid-flight. Without this,
  // the job would stay "matching" forever and the UI's spinner never stops.
  if (job.match_status === "matching") {
    const lastUpdate = new Date(job.updated_at).getTime()
    if (Date.now() - lastUpdate < STALE_MATCHING_AFTER_MS) {
      return NextResponse.json(
        {
          error: "already_matching",
          message: "Un matching est déjà en cours pour cette mission, patientez quelques instants.",
        },
        { status: 409 },
      )
    }
    // Stale — fall through and reset below.
  }

  const quota = await consumeQuota(admin, user.id, "match")
  if (!quota.ok) {
    return NextResponse.json({ error: "quota_exceeded", message: quota.message }, { status: 429 })
  }

  await admin.from("jobs")
    .update({ match_status: "matching", updated_at: new Date().toISOString() })
    .eq("id", job.id)

  try {
    // 1. Candidates — only successfully parsed ones can be matched.
    const { data: candRows } = await sb
      .from("candidates")
      .select(CANDIDATE_COLUMNS)
      .eq("parse_status", "parsed")
      .limit(1000)
    // raw_text isn't needed for matching — it works on taxonomy + summary.
    const candidates = (candRows ?? []) as unknown as Candidate[]

    if (candidates.length === 0) {
      await admin.from("jobs").update({
        match_status: "done", matched_at: new Date().toISOString(),
      }).eq("id", job.id)
      return NextResponse.json({ ok: true, scored: 0, prefiltered_out: 0, total: 0 })
    }

    // 2. Pre-filter
    const normalized = job.normalized ?? {}
    const hits = prefilterCandidates(normalized, candidates)
    const pool = hits.slice(0, MAX_SCORED_PER_RUN).map((h) => h.candidate)
    const prefilteredOut = candidates.length - hits.length

    // 3. Score in batches AND persist progressively. If the Vercel runtime
    //    is killed mid-flight (timeout, OOM, deploy), every batch that has
    //    already been written stays committed — the next retry skips them.
    const { data: existingRows } = await admin
      .from("match_assessments")
      .select("id, candidate_id")
      .eq("job_id", job.id)
    const existingByCand = new Map((existingRows ?? []).map((r) => [r.candidate_id, r.id]))

    const results: MatchResult[] = []
    for (let i = 0; i < pool.length; i += MATCH_BATCH_SIZE) {
      const batch = pool.slice(i, i + MATCH_BATCH_SIZE)
      let scored: MatchResult[] = []
      try {
        scored = await scoreBatch(job as Job, batch)
      } catch (err) {
        console.error("[match] batch failed:", (err as Error).message)
        continue  // Skip this batch but keep going.
      }
      results.push(...scored)

      // Persist this batch immediately so a later timeout doesn't lose it.
      const batchInserts: MatchInsert[] = []
      const batchUpdates: PromiseLike<unknown>[] = []
      for (const r of scored) {
        const existingId = existingByCand.get(r.candidate_id)
        if (existingId) {
          batchUpdates.push(
            admin.from("match_assessments").update({
              score: r.score,
              score_dimensions: r.dimensions,
              justification: r.justification,
              match_tier: r.tier,
            }).eq("id", existingId),
          )
        } else {
          batchInserts.push({
            user_id: user.id,
            job_id: job.id,
            candidate_id: r.candidate_id,
            score: r.score,
            score_dimensions: r.dimensions,
            justification: r.justification,
            match_tier: r.tier,
            pipeline_stage: "identified",
          })
        }
      }
      try {
        if (batchUpdates.length > 0) await Promise.all(batchUpdates)
        if (batchInserts.length > 0) {
          const { data: inserted } = await admin
            .from("match_assessments")
            .insert(batchInserts)
            .select("id, candidate_id")
          // Remember newly-inserted rows so a future re-score of the same
          // run (shouldn't happen, but defensive) hits the update branch.
          for (const row of inserted ?? []) {
            existingByCand.set(row.candidate_id, row.id)
          }
        }
      } catch (err) {
        console.error("[match] batch persist failed:", (err as Error).message)
      }

      // Heartbeat — refresh updated_at so the stale-recovery doesn't kick in
      // for a slow but progressing run.
      await admin.from("jobs")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", job.id)
    }

    // 5. Mission-tag write-back onto well-matched candidates' taxonomy.
    const tag = missionTagFor(job as Job)
    const winners = results.filter((r) => r.tier === "excellent" || r.tier === "good")
    const tagWrites: PromiseLike<unknown>[] = []
    for (const w of winners) {
      const cand = pool.find((c) => c.id === w.candidate_id)
      if (!cand) continue
      const nextTax = withMissionTag(cand.taxonomy, tag)
      // Only write if it actually changed (avoid useless updates / realtime noise).
      if (nextTax !== cand.taxonomy) {
        tagWrites.push(admin.from("candidates").update({ taxonomy: nextTax }).eq("id", cand.id))
      }
    }
    for (let i = 0; i < tagWrites.length; i += 12) {
      await Promise.all(tagWrites.slice(i, i + 12))
    }

    await admin.from("jobs").update({
      match_status: "done",
      matched_at: new Date().toISOString(),
    }).eq("id", job.id)

    return NextResponse.json({
      ok: true,
      total: candidates.length,
      prefiltered_out: prefilteredOut,
      scored: results.length,
      capped: hits.length > MAX_SCORED_PER_RUN,
    })
  } catch (err) {
    await admin.from("jobs").update({ match_status: "error" }).eq("id", job.id)
    return NextResponse.json(
      { error: "match_failed", detail: (err as Error).message },
      { status: 500 },
    )
  }
}
