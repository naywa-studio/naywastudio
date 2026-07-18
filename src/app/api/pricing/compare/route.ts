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
import { requirePricingAccess } from "@/lib/access-guard"
import { getAdminSupabase } from "@/lib/admin-supabase"
import { consumeQuota, consumeOrgLlmActionForUser } from "@/lib/quota"
import { openrouterChat } from "@/lib/openrouter"
import { computeQuickMargin } from "@/lib/pricing/quick-margin"
import type { Candidate, Job } from "@/lib/database.types"
import { getCabinetPricingConfig } from "@/lib/cabinet-config"

export const runtime = "nodejs"
export const maxDuration = 30

function buildSystemPrompt(lang: "fr" | "en"): string {
  if (lang === "en") {
    return `You are Nora, the sourcer's pricing assistant. You're shown two candidates positioned on the same mission. You produce a genuine reasoned opinion — who's the better pick, why, and what to watch out for.

Rules:
- Reply in strict JSON: { "winner": "A" | "B" | "tie", "commentary": string }.
- The commentary is 4-5 sentences, written in English.
- Expected structure:
  1. Opening sentence announcing the preference (or the tie) with the chosen candidate's name.
  2. The commercial WHY: compare average margin and monthly margin, quantify the gap in points or euros if relevant.
  3. The HR WHY: compare seniority, experience, and gross cost. If one is pricier but more experienced, explain the trade-off.
  4. A concrete point of attention: termination risk if gross is below the Syntec minimum, margin below the firm's floor, or a strong gap between displayed daily rate and proposed gross salary.
  5. (Optional) An action suggestion: "You could adjust X to…".
- If the gap is minor (< 1 margin pt AND equivalent gross), reply winner = "tie" and explain why both profiles are commercially equivalent, suggesting the human criterion that could break the tie.
- Don't re-list every raw number from the snapshot — extract the signals that matter for the decision and connect them.`
  }
  return `Tu es Nora, l'assistante pricing du sourceur. On te montre deux candidats positionnés sur la même mission. Tu produis un vrai avis raisonné — qui est le meilleur choix, pourquoi, et ce qu'il faut surveiller.

Règles :
- Réponds en JSON strict : { "winner": "A" | "B" | "tie", "commentary": string }.
- Le commentary fait 4 à 5 phrases en français, vouvoiement strict (jamais de tutoiement).
- Structure attendue :
  1. Phrase d'ouverture qui annonce la préférence (ou l'égalité) avec le nom du candidat retenu.
  2. Le POURQUOI commercial : compare la marge moyenne et la marge mensuelle, chiffrez l'écart en points ou en euros si pertinent.
  3. Le POURQUOI RH : compare la séniorité, l'expérience, et le coût brut. Si l'un est plus cher mais plus expérimenté, expliquez l'arbitrage.
  4. Un point d'attention concret : risque rupture si le brut est sous le minimum Syntec, marge sous le plancher cabinet, ou écart fort entre TJM affiché et brut proposé.
  5. (Optionnel) Une suggestion d'action : "Vous pourriez ajuster X pour…".
- Si l'écart est minime (< 1 pt de marge ET brut équivalent), réponds winner = "tie" et expliquez pourquoi les deux profils se valent commercialement, en suggérant le critère humain qui pourrait départager.
- Ne ré-énumérez pas tous les chiffres bruts du snapshot — extrayez les signaux qui pèsent dans la décision et reliez-les entre eux.`
}

interface Body {
  matchAId?: string
  matchBId?: string
  lang?: string
}

export async function POST(req: NextRequest) {
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })
  const gate = await requirePricingAccess()
  if (!gate.ok) return gate.response

  const body = (await req.json().catch(() => null)) as Body | null
  const a = body?.matchAId?.trim()
  const b = body?.matchBId?.trim()
  if (!a || !b || a === b) return NextResponse.json({ error: "bad_body" }, { status: 400 })
  const lang: "fr" | "en" = body?.lang === "en" ? "en" : "fr"

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

  // Cabinet pricing defaults (org-scoped, single source of truth).
  const cabinetConfig = await getCabinetPricingConfig(sb, user.id)
  const profileSlim = cabinetConfig
    ? {
        pricing_billable_days_per_month: cabinetConfig.pricing_billable_days_per_month,
        pricing_rtt_days_per_year: cabinetConfig.pricing_rtt_days_per_year,
        pricing_default_lieu: cabinetConfig.pricing_default_lieu,
        pricing_default_avantages: cabinetConfig.pricing_default_avantages,
      }
    : null

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
  const orgLlm = await consumeOrgLlmActionForUser(getAdminSupabase(), user.id)
  if (!orgLlm.ok) {
    return NextResponse.json({ error: orgLlm.code ?? "llm_quota_exceeded", message: orgLlm.message }, { status: 429 })
  }

  // Brève synthèse écart pour pré-mâcher l'analyse côté LLM.
  const margePctDelta = Number((qA.margePct - qB.margePct).toFixed(1))
  const margeMonthDelta = Math.round(qA.margeMensuelleEur - qB.margeMensuelleEur)
  const margeTotalA = Math.round(qA.margeMensuelleEur * (job.duration_months ?? 12))
  const margeTotalB = Math.round(qB.margeMensuelleEur * (job.duration_months ?? 12))
  const brutDelta = Math.round(qA.brut - qB.brut)
  const xpDelta = (candA.years_experience ?? 0) - (candB.years_experience ?? 0)

  const candidateSnapshot = (cand: Candidate, q: NonNullable<ReturnType<typeof computeQuickMargin>>) => ({
    nom: cand.full_name,
    poste_actuel: cand.current_title,
    ans_xp: cand.years_experience,
    seniorite_niveau: cand.seniority_level,
    tjm_eur_jour: q.tjm,
    brut_annuel_eur: Math.round(q.brut),
    marge_moyenne_pct: Number(q.margePct.toFixed(1)),
    marge_mensuelle_eur: Math.round(q.margeMensuelleEur),
    marge_totale_eur: Math.round(q.margeMensuelleEur * (job.duration_months ?? 12)),
    rappel_competences: (cand.skills ?? []).slice(0, 8),
  })

  const snapshot = {
    mission: {
      titre: job.title,
      lieu: job.location,
      tjm_cible_min: job.client_tjm_min ?? null,
      tjm_cible_max: job.client_tjm_max ?? null,
      duree_mois: job.duration_months ?? null,
      marge_cible_pct: job.margin_target_pct ?? 22,
      marge_min_pct: job.margin_min_pct ?? 15,
      brut_cible: job.target_gross_salary ?? null,
    },
    ecarts: {
      marge_moyenne_pts_a_vs_b: margePctDelta,
      marge_mensuelle_eur_a_vs_b: margeMonthDelta,
      marge_totale_eur_a_moins_b: margeTotalA - margeTotalB,
      brut_eur_a_moins_b: brutDelta,
      annees_xp_a_moins_b: xpDelta,
    },
    A: candidateSnapshot(candA, qA),
    B: candidateSnapshot(candB, qB),
  }

  try {
    const result = await openrouterChat({
      model: "openai/gpt-4o-mini",
      temperature: 0.3,
      maxTokens: 600,
      responseFormat: "json_object",
      timeoutMs: 25_000,
      messages: [
        { role: "system", content: buildSystemPrompt(lang) },
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
