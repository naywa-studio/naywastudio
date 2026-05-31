/**
 * POST /api/pricing/compare   { matchAId, matchBId }
 *
 * Demande à Nora un avis express sur 2 candidats côte à côte pour une même
 * mission. La logique de pricing reste 100 % dans syntec.ts — on charge les
 * matches, on recompute les marges via computeQuickMargin, puis on envoie un
 * snapshot compact à l'LLM pour qu'il commente.
 *
 * Réponse :
 *   { winner: "A" | "B" | "tie", commentary: string }
 */

import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { getAdminSupabase } from "@/lib/admin-supabase"
import { consumeQuota } from "@/lib/quota"
import { openrouterChat } from "@/lib/openrouter"
import { computeQuickMargin } from "@/lib/pricing/quick-margin"
import type { Candidate, Job, Profile } from "@/lib/database.types"

export const runtime = "nodejs"
export const maxDuration = 30

const SYSTEM_PROMPT = `Tu es Nora, l'assistante pricing du sourceur. On te montre deux candidats positionnés sur la même mission. Tu donnes un avis tranché et court — qui est le meilleur choix, et pourquoi.

Règles :
- Réponds en JSON strict : { "winner": "A" | "B" | "tie", "commentary": string }.
- Le commentary fait 2 à 3 phrases maximum, en français, vouvoiement (jamais de tutoiement).
- Tu compares marge moyenne, marge mensuelle, séniorité, et brut. Tu ne fais aucune supposition sur la qualité humaine du candidat — uniquement les chiffres et la séniorité.
- Si l'écart est minime (< 1 pt de marge ET brut équivalent), réponds tie et explique-le.
- Ne ré-explique pas les chiffres déjà visibles — vas droit à la décision ("Le candidat A est plus rentable…", "Préférez le candidat B…").`

interface Body {
  matchAId?: string
  matchBId?: string
}

export async function POST(req: NextRequest) {
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })

  const body = (await req.json().catch(() => null)) as Body | null
  const a = body?.matchAId?.trim()
  const b = body?.matchBId?.trim()
  if (!a || !b || a === b) return NextResponse.json({ error: "bad_body" }, { status: 400 })

  // RLS-scoped load — 404 si un des matchs n'appartient pas au user
  const { data: rows, error: fetchErr } = await sb
    .from("match_assessments")
    .select(`
      id, pricing_tjm, pricing_brut,
      candidate:candidates(*),
      job:jobs(*)
    `)
    .in("id", [a, b])
  if (fetchErr || !rows || rows.length !== 2) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }

  // Both matches must belong to the same job (it makes no sense to compare
  // two candidates across different missions in this UI).
  const jobsArr = rows.map((r) => Array.isArray(r.job) ? r.job[0] : r.job)
  if (!jobsArr[0] || !jobsArr[1] || jobsArr[0].id !== jobsArr[1].id) {
    return NextResponse.json({ error: "different_jobs" }, { status: 400 })
  }
  const job = jobsArr[0] as Job

  // Profile (cabinet defaults) — needed for the margin compute.
  const { data: profile } = await sb
    .from("profiles")
    .select("pricing_billable_days_per_month, pricing_default_lieu, pricing_default_avantages")
    .eq("user_id", user.id)
    .maybeSingle()
  const profileSlim = profile as Pick<
    Profile,
    "pricing_billable_days_per_month" | "pricing_default_lieu" | "pricing_default_avantages"
  > | null

  // Re-order to match the client's A/B order.
  const rowA = rows.find((r) => r.id === a)!
  const rowB = rows.find((r) => r.id === b)!
  const candA = (Array.isArray(rowA.candidate) ? rowA.candidate[0] : rowA.candidate) as Candidate
  const candB = (Array.isArray(rowB.candidate) ? rowB.candidate[0] : rowB.candidate) as Candidate

  const qA = computeQuickMargin({ candidate: candA, job, profile: profileSlim, persistedTjm: rowA.pricing_tjm, persistedBrut: rowA.pricing_brut })
  const qB = computeQuickMargin({ candidate: candB, job, profile: profileSlim, persistedTjm: rowB.pricing_tjm, persistedBrut: rowB.pricing_brut })
  if (!qA || !qB) {
    return NextResponse.json({ error: "mission_not_parametered" }, { status: 400 })
  }

  // Quota — same bucket as the assistant (lightweight prompt).
  const quota = await consumeQuota(getAdminSupabase(), user.id, "assistant")
  if (!quota.ok) {
    return NextResponse.json({ error: "quota_exceeded", message: quota.message }, { status: 429 })
  }

  const snapshot = {
    mission: {
      titre: job.title,
      tjm_cible: job.client_tjm_min ?? null,
      duree_mois: job.duration_months ?? null,
      marge_cible_pct: job.margin_target_pct ?? 22,
      marge_min_pct: job.margin_min_pct ?? 15,
    },
    A: {
      nom: candA.full_name,
      poste_actuel: candA.current_title,
      ans_xp: candA.years_experience,
      tjm_eur_jour: qA.tjm,
      brut_annuel_eur: Math.round(qA.brut),
      marge_moyenne_pct: Number(qA.margePct.toFixed(1)),
      marge_mensuelle_eur: Math.round(qA.margeMensuelleEur),
    },
    B: {
      nom: candB.full_name,
      poste_actuel: candB.current_title,
      ans_xp: candB.years_experience,
      tjm_eur_jour: qB.tjm,
      brut_annuel_eur: Math.round(qB.brut),
      marge_moyenne_pct: Number(qB.margePct.toFixed(1)),
      marge_mensuelle_eur: Math.round(qB.margeMensuelleEur),
    },
  }

  try {
    const result = await openrouterChat({
      model: "openai/gpt-4o-mini",
      temperature: 0.3,
      maxTokens: 280,
      responseFormat: "json_object",
      timeoutMs: 25_000,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Compare ces deux candidats :\n\n${JSON.stringify(snapshot, null, 2)}` },
      ],
    })
    const parsed = JSON.parse(result.content) as { winner?: unknown; commentary?: unknown }
    const winner = parsed.winner === "A" || parsed.winner === "B" || parsed.winner === "tie" ? parsed.winner : "tie"
    const commentary = typeof parsed.commentary === "string" ? parsed.commentary.trim() : ""
    if (!commentary) {
      return NextResponse.json({ error: "empty_commentary" }, { status: 502 })
    }
    return NextResponse.json({ winner, commentary })
  } catch (err) {
    return NextResponse.json(
      { error: "llm_failed", detail: (err as Error).message },
      { status: 502 },
    )
  }
}
