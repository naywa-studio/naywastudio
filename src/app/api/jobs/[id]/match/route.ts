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
import { consumeQuota, consumeOrgLlmActionForUser } from "@/lib/quota"
import { CANDIDATE_COLUMNS, type Candidate, type Job, type Database } from "@/lib/database.types"

type MatchInsert = Database["public"]["Tables"]["match_assessments"]["Insert"]

export const runtime = "nodejs"
// 300 s = max Vercel Pro. Sur Hobby ça retombe silencieusement à 60 s,
// mais avec batch_size 8 + concurrence 20 (cf. plus bas) 200 candidats
// passent en ~15-20 s, donc Hobby reste viable pour un vivier normal.
export const maxDuration = 300

// Plafond très haut depuis PR 10 — les batches sont maintenant exécutés
// en parallèle (cf. Promise.allSettled plus bas) avec un sémaphore qui
// limite la concurrence à CONCURRENT_BATCHES. Pour un vivier de 250 CVs :
// pré-filtre garde par ex. 80 candidats plausibles → 20 batches × 5 s
// (avec concurrence 10) ≈ 10-15 s. Reste très en dessous des 60 s Vercel.
//
// Si le pré-filtre laisse passer un nombre énorme (vivier ouvert sans
// must-have skills), on cap à 500 pour ne pas griller le budget LLM
// d'un coup — l'user peut re-run pour les restants.
const MAX_SCORED_PER_RUN = 500
// 20 batches simultanés : 200 candidats / 8 = 25 batches → 2 vagues
// concurrentes de ~6-8 s = 15-20 s total. OpenRouter accepte
// largement 20 req simultanées sur gpt-4o-mini.
const CONCURRENT_BATCHES = 20

/**
 * If a previous run was killed mid-flight by Vercel (timeout, OOM, deploy),
 * the `match_status='matching'` flag is never cleared because no catch block
 * runs on a hard kill. We treat any "matching" older than 75 seconds as
 * stale and reset it so the sourceur can retry without manual DB surgery.
 * 75 s = Vercel Hobby maxDuration (60 s) + a 15 s safety margin to avoid
 * stomping on a run that's actually still finishing its last batch.
 */
const STALE_MATCHING_AFTER_MS = 75_000

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })

  const { data: job, error: jobErr } = await sb.from("jobs").select("*").eq("id", id).single()
  if (jobErr || !job) return NextResponse.json({ error: "not_found" }, { status: 404 })

  const admin = getAdminSupabase()

  // The "Forcer la relance" UX button passes ?force=1 — it bypasses the
  // stale check entirely so the sourceur can always unblock themselves
  // when they're convinced the previous run is dead.
  const force = new URL(req.url).searchParams.get("force") === "1"

  // Recover from a previous run killed by Vercel mid-flight. Without this,
  // the job would stay "matching" forever and the UI's spinner never stops.
  if (!force && job.match_status === "matching") {
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
  const orgLlm = await consumeOrgLlmActionForUser(admin, user.id)
  if (!orgLlm.ok) {
    return NextResponse.json({ error: orgLlm.code ?? "llm_quota_exceeded", message: orgLlm.message }, { status: 429 })
  }

  await admin.from("jobs")
    .update({
      match_status: "matching",
      updated_at: new Date().toISOString(),
      // Clear progression d'un éventuel run précédent — sera resettée
      // une fois le pool calculé ci-dessous.
      match_progress_total: null,
      match_progress_scored: null,
    })
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
        match_status: "done",
        matched_at: new Date().toISOString(),
        match_progress_total: null,
        match_progress_scored: null,
      }).eq("id", job.id)
      return NextResponse.json({ ok: true, scored: 0, prefiltered_out: 0, total: 0 })
    }

    // 2. Pre-filter
    const normalized = job.normalized ?? {}
    const hits = prefilterCandidates(normalized, candidates)
    const pool = hits.slice(0, MAX_SCORED_PER_RUN).map((h) => h.candidate)
    const prefilteredOut = candidates.length - hits.length

    // Stamp la taille du pool : la barre UI calcule pct = scored/total.
    await admin.from("jobs").update({
      match_progress_total: pool.length,
      match_progress_scored: 0,
    }).eq("id", job.id)

    // 3. Score in batches AND persist progressively. Batches are run **in
    //    parallel** : chaque scoreBatch est indépendant (le LLM ne voit
    //    qu'un sous-pool à la fois), donc lancer 5-10 appels concurrents
    //    divise le temps total par ~N au lieu de payer N × latence.
    //    Si le runtime est killé mid-flight (timeout, OOM, deploy), chaque
    //    batch déjà settlé a déjà persisté ses résultats — le retry skip
    //    les candidats existants via existingByCand.
    const { data: existingRows } = await admin
      .from("match_assessments")
      .select("id, candidate_id")
      .eq("job_id", job.id)
    const existingByCand = new Map((existingRows ?? []).map((r) => [r.candidate_id, r.id]))

    const batches: Candidate[][] = []
    for (let i = 0; i < pool.length; i += MATCH_BATCH_SIZE) {
      batches.push(pool.slice(i, i + MATCH_BATCH_SIZE))
    }

    // Compteur partagé : chaque batch qui finit l'incrémente et flush.
    // Pas de race vraie car JS est mono-thread sur les microtasks ; chaque
    // settle handler s'exécute atomiquement.
    let completedSoFar = 0
    const results: MatchResult[] = []

    // Pool de workers — chaque worker pioche dans la queue jusqu'à
    // épuisement. CONCURRENT_BATCHES limite la pression simultanée sur
    // OpenRouter (rate-limit-friendly) tout en gardant la latence basse.
    const queue = [...batches]
    const processOne = async (batch: Candidate[]) => {
      let scored: MatchResult[]
      try {
        scored = await scoreBatch(job as Job, batch)
      } catch (err) {
        console.error("[match] batch failed:", (err as Error).message)
        return
      }
      results.push(...scored)

      // Persiste les résultats du batch dès qu'ils sont prêts (pas attendre
      // les autres batches en cours).
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
          for (const row of inserted ?? []) {
            existingByCand.set(row.candidate_id, row.id)
          }
        }
      } catch (err) {
        console.error("[match] batch persist failed:", (err as Error).message)
      }

      // Avance le compteur après que le batch est persisté. Permet à l'UI
      // de voir "scored/total" évoluer même quand tout tourne en parallèle.
      completedSoFar += batch.length
      await admin.from("jobs").update({
        match_progress_scored: Math.min(completedSoFar, pool.length),
        updated_at: new Date().toISOString(),
      }).eq("id", job.id)
    }
    const workers = Array.from(
      { length: Math.min(CONCURRENT_BATCHES, queue.length) },
      async () => {
        while (queue.length > 0) {
          const next = queue.shift()
          if (!next) return
          await processOne(next)
        }
      },
    )
    await Promise.all(workers)

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
      match_progress_total: null,
      match_progress_scored: null,
    }).eq("id", job.id)

    return NextResponse.json({
      ok: true,
      total: candidates.length,
      prefiltered_out: prefilteredOut,
      scored: results.length,
      capped: hits.length > MAX_SCORED_PER_RUN,
    })
  } catch (err) {
    await admin.from("jobs").update({
      match_status: "error",
      match_progress_total: null,
      match_progress_scored: null,
    }).eq("id", job.id)
    return NextResponse.json(
      { error: "match_failed", detail: (err as Error).message },
      { status: 500 },
    )
  }
}
