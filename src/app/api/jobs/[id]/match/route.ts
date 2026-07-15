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
  scoreBatchCriteria,
  missionTagFor,
  withMissionTag,
  MATCH_BATCH_SIZE,
  type CriteriaMatchResult,
} from "@/lib/matching"
import type { Criterion } from "@/lib/job-criteria-catalog"
import { partitionByGate, type MatchMode } from "@/lib/sector-gate"
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

  // PR-Z : il faut que les critères soient configurés avant de matcher.
  const criteria = (job.criteria ?? []) as Criterion[]
  if (!job.criteria_locked_at || criteria.length === 0) {
    return NextResponse.json({
      error: "criteria_not_configured",
      message: "Configure les critères de la mission avant de lancer le matching.",
    }, { status: 400 })
  }

  const admin = getAdminSupabase()

  // The "Forcer la relance" UX button passes ?force=1 — it bypasses the
  // stale check entirely so the sourceur can always unblock themselves
  // when they're convinced the previous run is dead.
  const force = new URL(req.url).searchParams.get("force") === "1"

  // Panneau "Matcher le vivier" : mode + secteurs cibles (chips éditées).
  // Défaut "complet" quand le body est absent (ancien appelant / bouton
  // "Forcer la relance") → on ne casse rien : tout le vivier est scoré.
  const body = await req.json().catch(() => null) as
    { mode?: unknown; target_sectors?: unknown; lang?: unknown } | null
  const mode: MatchMode =
    body?.mode === "intelligent" || body?.mode === "personnalise" ? body.mode : "complet"
  const lang: "fr" | "en" = body?.lang === "en" ? "en" : "fr"
  const bodySectors = Array.isArray(body?.target_sectors)
    ? (body!.target_sectors as unknown[]).map((s) => String(s).trim()).filter(Boolean)
    : null
  // Secteurs cibles effectifs : ceux édités dans le panneau sinon ceux mémo
  // sur la mission. Persistés plus bas (mémo pour le prochain run).
  const targetSectors = bodySectors ?? (job.target_sectors ?? [])

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
      // Mémo du mode + secteurs cibles (repart vite au prochain run).
      // On ne persiste les secteurs que si le panneau les a envoyés (édition).
      last_match_mode: mode,
      ...(bodySectors ? { target_sectors: bodySectors } : {}),
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

    // 1bis. GATE SECTEUR (modes Intelligent / Personnalisé). Pré-filtre
    // déterministe GRATUIT avant le LLM : écarte les candidats clairement hors
    // périmètre (séniorité absurde, hors secteurs cibles). "complet" = aucun
    // gate. Règle de fiabilité : jamais d'exclusion dans le doute (cf.
    // sector-gate.ts — séniorité inconnue / candidat non classé = gardés).
    //
    // CANARY : on garde ~5% des écartés (échantillon aléatoire) DANS le pool à
    // scorer. Si l'un d'eux ressort bon, c'est le signal que le gate est trop
    // serré → on le remonte à l'user (élargir le périmètre). Coût LLM marginal,
    // filet contre un secteur/séniorité mal posé.
    const CANARY_RATIO = 0.05
    const CANARY_CAP = 15
    let gateBase: Candidate[] = candidates
    const canaryIds = new Set<string>()
    if (mode !== "complet") {
      const gateJob = {
        normalized: job.normalized ?? null,
        contract_type: job.contract_type,
        target_sectors: targetSectors,
      }
      const { kept, gatedOut } = partitionByGate(candidates, gateJob, mode)
      // Échantillon canary déterministe-léger (mélange par id, prend N).
      const canaryCount = Math.min(CANARY_CAP, Math.ceil(gatedOut.length * CANARY_RATIO))
      const canary = [...gatedOut]
        .sort((a, b) => a.id.localeCompare(b.id))
        .slice(0, canaryCount)
      for (const c of canary) canaryIds.add(c.id)
      gateBase = [...kept, ...canary]
    }
    const gatedOutCount = candidates.length - gateBase.length

    // 2. Pre-filter — mais PERMISSIF (PR-Z).
    //
    // Le pré-filtre déterministe se base sur role_family/skills de
    // l'ancienne extraction `normalized`, PAS sur les critères flexibles
    // de la mission. Il pouvait donc écarter un candidat parfaitement
    // pertinent au regard des critères (ex : "Commercial Immobilier" dont
    // la taxonomy dit "Commerce" sans "Immobilier"). Résultat : le
    // sourceur voyait "matcher le vivier" ne remonter qu'une poignée de
    // profils sur un vivier de 80.
    //
    // Nouveau comportement : quand le vivier tient dans un run raisonnable
    // (≤ SCORE_ALL_BELOW), on score TOUT le monde — c'est le scoring LLM
    // par critères qui tranche la pertinence (un hors-sujet aura un score
    // bas, pas besoin de le dropper en amont). Le pré-filtre ne sert alors
    // qu'à ORDONNER la file (meilleurs candidats scorés en premier).
    // Au-delà, on garde le drop pour maîtriser le budget LLM.
    // NB : le pré-filtre travaille sur `gateBase` (le vivier APRÈS gate
    // secteur/séniorité), pas sur tout le vivier. En mode "complet",
    // gateBase === candidates.
    const normalized = job.normalized ?? {}
    const hits = prefilterCandidates(normalized, gateBase)
    const SCORE_ALL_BELOW = 200
    let pool: Candidate[]
    if (gateBase.length <= SCORE_ALL_BELOW) {
      // Score tout : on part de l'ordre du pré-filtre (signal décroissant)
      // puis on ajoute les candidats écartés à la fin (ils seront scorés
      // aussi, juste en dernier).
      const inHits = new Set(hits.map((h) => h.candidate.id))
      const ordered = hits.map((h) => h.candidate)
      const rest = gateBase.filter((c) => !inHits.has(c.id))
      pool = [...ordered, ...rest].slice(0, MAX_SCORED_PER_RUN)
    } else {
      pool = hits.slice(0, MAX_SCORED_PER_RUN).map((h) => h.candidate)
    }
    const prefilteredOut = gateBase.length - pool.length

    // Matchs déjà présents pour cette mission (id par candidat).
    const { data: existingRows } = await admin
      .from("match_assessments")
      .select("id, candidate_id")
      .eq("job_id", job.id)
    const existingByCand = new Map((existingRows ?? []).map((r) => [r.candidate_id, r.id]))

    // INCRÉMENTAL vs RESCORE COMPLET (économie LLM) :
    //  - Mission jamais matchée OU critères modifiés depuis le dernier match
    //    (criteria_locked_at > matched_at) → on reprend TOUT le vivier : les
    //    critères ont changé, il faut ré-évaluer tout le monde.
    //  - Sinon (critères inchangés) → on ne score QUE les candidats pas encore
    //    évalués (nouveaux CV arrivés au vivier). Les scores existants restent.
    const lastMatchedMs = job.matched_at ? new Date(job.matched_at).getTime() : 0
    const critLockedMs = job.criteria_locked_at ? new Date(job.criteria_locked_at).getTime() : 0
    const fullRescore = lastMatchedMs === 0 || critLockedMs > lastMatchedMs
    if (!fullRescore) {
      pool = pool.filter((c) => !existingByCand.has(c.id))
    }

    // Rien de nouveau à scorer : vivier déjà à jour pour ces critères.
    if (pool.length === 0) {
      await admin.from("jobs").update({
        match_status: "done",
        matched_at: new Date().toISOString(),
        match_progress_total: null,
        match_progress_scored: null,
      }).eq("id", job.id)
      return NextResponse.json({ ok: true, scored: 0, up_to_date: true, total: candidates.length })
    }

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
    const batches: Candidate[][] = []
    for (let i = 0; i < pool.length; i += MATCH_BATCH_SIZE) {
      batches.push(pool.slice(i, i + MATCH_BATCH_SIZE))
    }

    // Compteur partagé : chaque batch qui finit l'incrémente et flush.
    // Pas de race vraie car JS est mono-thread sur les microtasks ; chaque
    // settle handler s'exécute atomiquement.
    let completedSoFar = 0
    const results: CriteriaMatchResult[] = []

    // Pool de workers — chaque worker pioche dans la queue jusqu'à
    // épuisement. CONCURRENT_BATCHES limite la pression simultanée sur
    // OpenRouter (rate-limit-friendly) tout en gardant la latence basse.
    const queue = [...batches]
    const processOne = async (batch: Candidate[]) => {
      let scored: CriteriaMatchResult[]
      try {
        scored = await scoreBatchCriteria(job as Job, criteria, batch, lang)
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
              criteria_eval: r.criteria_eval,
              match_tier: r.tier,
            }).eq("id", existingId),
          )
        } else {
          batchInserts.push({
            user_id: user.id,
            job_id: job.id,
            candidate_id: r.candidate_id,
            score: r.score,
            criteria_eval: r.criteria_eval,
            match_tier: r.tier,
            pipeline_stage: "identified",
            source: "vivier_matched",
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

    // 4bis. RATTRAPAGE — un batch qui a jeté (timeout OpenRouter, JSON
    // malformé) était droppé silencieusement → des candidats du pool ne
    // recevaient jamais de score (symptôme : "matcher le vivier" ne remonte
    // pas tout, 37/66 au lieu de 66/66). On repasse sur les manquants en
    // TRÈS petits batches (plus résilients) avec 2 tentatives. processOne
    // persiste + met à jour la progression comme au 1er passage.
    const RETRY_BATCH_SIZE = 3
    for (let attempt = 0; attempt < 2; attempt++) {
      const scoredIds = new Set(results.map((r) => r.candidate_id))
      const missing = pool.filter((c) => !scoredIds.has(c.id))
      if (missing.length === 0) break
      console.warn(`[match] retry ${attempt + 1}: ${missing.length} candidat(s) non scoré(s)`)
      const retryBatches: Candidate[][] = []
      for (let i = 0; i < missing.length; i += RETRY_BATCH_SIZE) {
        retryBatches.push(missing.slice(i, i + RETRY_BATCH_SIZE))
      }
      const rQueue = [...retryBatches]
      const rWorkers = Array.from(
        { length: Math.min(CONCURRENT_BATCHES, rQueue.length) },
        async () => {
          while (rQueue.length > 0) {
            const next = rQueue.shift()
            if (!next) return
            await processOne(next)
          }
        },
      )
      await Promise.all(rWorkers)
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
      match_progress_total: null,
      match_progress_scored: null,
    }).eq("id", job.id)

    // CANARY : un candidat écarté par le gate qui ressort bon = signal que le
    // périmètre est trop serré. On le remonte à l'UI (proposer d'élargir).
    const canaryHits = results.filter(
      (r) => canaryIds.has(r.candidate_id) && (r.tier === "excellent" || r.tier === "good"),
    ).length

    return NextResponse.json({
      ok: true,
      total: candidates.length,
      prefiltered_out: prefilteredOut,
      gated_out: gatedOutCount,
      scored: results.length,
      canary_hits: canaryHits,
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
