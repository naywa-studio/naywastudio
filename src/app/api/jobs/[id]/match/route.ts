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
import type { Candidate, Job, Database } from "@/lib/database.types"

type MatchInsert = Database["public"]["Tables"]["match_assessments"]["Insert"]

export const runtime = "nodejs"
export const maxDuration = 60

// Hard ceiling per run so a huge vivier can't blow the 60s function budget
// (≈10 LLM batches + DB writes). The pre-filter sorts by relevance signal,
// so the best candidates are always covered first; the user can re-run.
const MAX_SCORED_PER_RUN = 80

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })

  const { data: job, error: jobErr } = await sb.from("jobs").select("*").eq("id", id).single()
  if (jobErr || !job) return NextResponse.json({ error: "not_found" }, { status: 404 })

  const admin = getAdminSupabase()
  await admin.from("jobs").update({ match_status: "matching" }).eq("id", job.id)

  try {
    // 1. Candidates — only successfully parsed ones can be matched.
    const { data: candRows } = await sb
      .from("candidates")
      .select("*")
      .eq("parse_status", "parsed")
      .limit(1000)
    const candidates = (candRows ?? []) as Candidate[]

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

    // 3. Score in batches
    const results: MatchResult[] = []
    for (let i = 0; i < pool.length; i += MATCH_BATCH_SIZE) {
      const batch = pool.slice(i, i + MATCH_BATCH_SIZE)
      try {
        const scored = await scoreBatch(job as Job, batch)
        results.push(...scored)
      } catch (err) {
        console.error("[match] batch failed:", (err as Error).message)
        // Don't abort the whole run — skip this batch.
      }
    }

    // 4. Upsert assessments, preserving pipeline_stage on existing rows.
    const { data: existingRows } = await admin
      .from("match_assessments")
      .select("id, candidate_id")
      .eq("job_id", job.id)
    const existingByCand = new Map((existingRows ?? []).map((r) => [r.candidate_id, r.id]))

    const toInsert: MatchInsert[] = []
    const updates: PromiseLike<unknown>[] = []
    for (const r of results) {
      const existingId = existingByCand.get(r.candidate_id)
      if (existingId) {
        updates.push(
          admin.from("match_assessments").update({
            score: r.score,
            score_dimensions: r.dimensions,
            justification: r.justification,
            match_tier: r.tier,
          }).eq("id", existingId),
        )
      } else {
        toInsert.push({
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
    // Run the existing-row updates concurrently in bounded chunks.
    for (let i = 0; i < updates.length; i += 12) {
      await Promise.all(updates.slice(i, i + 12))
    }
    if (toInsert.length > 0) {
      await admin.from("match_assessments").insert(toInsert)
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
