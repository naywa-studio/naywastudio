/**
 * POST /api/jobs/:id/adjust   (lot 3c v3 — Nora réajuste la mission)
 *
 * Deux sources, un même moteur :
 *   - source "feedback" : Nora lit les retours du client sur les candidats
 *     ÉCARTÉS (motifs + commentaires), mais UNIQUEMENT ceux plus récents que le
 *     filigrane `feedback_consumed_until` → jamais deux fois le même retour.
 *   - source "general" : le sourceur donne une consigne libre (`instruction`).
 *
 * Dans les deux cas Nora PART DES CRITÈRES ACTUELS (qui reflètent déjà les
 * ajustements passés) + voit l'historique → elle RENFORCE/ASSOUPLIT au lieu de
 * dupliquer. N'écrit RIEN : le sourceur applique via PATCH /criteria (qui pose
 * le filigrane, historise et relance le matching) ou ignore.
 *
 * Garde-fou produit : Nora PROPOSE, n'applique jamais seule.
 */

import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { requireActiveAccess } from "@/lib/access-guard"
import { getAdminSupabase } from "@/lib/admin-supabase"
import { consumeOrgLlmActionForUser } from "@/lib/quota"
import { openrouterChat, safeJsonParse } from "@/lib/openrouter"
import {
  CRITERION_CATALOG, capCriteria, normalizeCriterion,
  type Criterion, type CriterionType, type CriteriaAdjustment,
} from "@/lib/job-criteria-catalog"
import { clientRejectReasonLabel, isClientRejectReason } from "@/lib/client-reject-reasons"
import type { Job } from "@/lib/database.types"

export const runtime = "nodejs"
export const maxDuration = 30

function buildSystemPrompt(): string {
  const catalog = Object.entries(CRITERION_CATALOG)
    .map(([type, entry]) => `- ${type} (${entry.kind})${entry.paramKeys.length ? ` — params : ${entry.paramKeys.join(", ")}` : ""}`)
    .join("\n")
  return `Tu es Nora, l'assistante de matching recrutement Naywa. Tu proposes une VERSION RÉVISÉE des critères d'une mission pour améliorer le prochain matching.

CATALOGUE DE TYPES (n'invente rien d'autre, sauf "custom" en dernier recours) :
${catalog}

RÈGLES CLÉS
- Les critères ACTUELS reflètent DÉJÀ les ajustements passés (cf. HISTORIQUE fourni). NE REFAIS PAS un ajustement déjà appliqué.
- Pars des critères actuels et ajuste au MINIMUM nécessaire. Ne repars jamais de zéro.
- Si une demande/retour RÉINSISTE sur un point déjà ajusté, RENFORCE le critère existant (monte le seuil / durcis params) — n'ajoute PAS un doublon.
- Tu peux aussi ASSOUPLIR un critère si le signal indique qu'on manque de profils.
- Garde UN SEUL critère "skills". 4-5 critères "main" max + quelques "bonus".
- Chaque changement doit répondre à un signal concret (un motif client, un commentaire, ou la consigne du sourceur).
- Si RIEN ne justifie de changer par rapport aux critères actuels, renvoie criteria = critères actuels À L'IDENTIQUE et changes = [] avec un summary l'expliquant.

RÉPONDS EN JSON STRICT :
{
  "summary": "1-2 phrases en français : ce que tu ajustes et pourquoi (ton posé, factuel). Si rien ne bouge, dis-le.",
  "changes": ["puce courte décrivant un changement", "..."],
  "criteria": [ /* liste COMPLÈTE révisée des critères, format catalogue */ ]
}`
}

const SYSTEM_PROMPT = buildSystemPrompt()

type Body = { source?: unknown; instruction?: unknown }

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })
  const gate = await requireActiveAccess()
  if (!gate.ok) return gate.response

  const { data: jobRow, error: jobErr } = await sb.from("jobs").select("*").eq("id", id).single()
  if (jobErr || !jobRow) return NextResponse.json({ error: "not_found" }, { status: 404 })
  const job = jobRow as Job

  const body = await req.json().catch(() => null) as Body | null
  const source: "feedback" | "general" = body?.source === "general" ? "general" : "feedback"
  const instruction = typeof body?.instruction === "string" ? body.instruction.trim().slice(0, 600) : ""

  if (source === "general" && instruction.length === 0) {
    return NextResponse.json({ error: "instruction_required" }, { status: 400 })
  }

  // Contexte commun envoyé à Nora dans les deux modes.
  const history = (job.criteria_adjustments ?? []) as CriteriaAdjustment[]
  const historyPayload = history.slice(-6).map((a) => ({
    quand: a.at, origine: a.source ?? "feedback", resume: a.summary, changements: a.changes,
  }))
  const missionPayload = {
    role: job.role_name?.trim() || job.title,
    seniority: job.seniority ?? job.normalized?.seniority ?? null,
    criteres_actuels: job.criteria ?? [],
  }

  // ── Payload spécifique à la source ────────────────────────────────
  let userContent: string
  let feedbackWatermark: string | null = null

  if (source === "feedback") {
    const { data: rejected } = await sb
      .from("match_assessments")
      .select("client_reject_reasons, client_feedback_note, client_feedback_at")
      .eq("job_id", id)
      .eq("pipeline_stage", "rejected")

    const consumedUntil = job.feedback_consumed_until ? new Date(job.feedback_consumed_until).getTime() : 0
    const reasonCounts = new Map<string, number>()
    const notes: string[] = []
    let maxAt = 0
    for (const r of rejected ?? []) {
      // On ne garde QUE le retour plus récent que le filigrane.
      const at = r.client_feedback_at ? new Date(r.client_feedback_at).getTime() : 0
      if (at <= consumedUntil) continue
      let counted = false
      for (const raw of (r.client_reject_reasons ?? [])) {
        if (isClientRejectReason(raw)) { reasonCounts.set(raw, (reasonCounts.get(raw) ?? 0) + 1); counted = true }
      }
      const note = (r.client_feedback_note ?? "").trim()
      if (note) { notes.push(note); counted = true }
      if (counted && at > maxAt) maxAt = at
    }

    if (reasonCounts.size === 0 && notes.length === 0) {
      // Aucun retour NOUVEAU : Nora n'a rien à proposer.
      return NextResponse.json({ ok: true, no_feedback: true, source })
    }
    feedbackWatermark = maxAt > 0 ? new Date(maxAt).toISOString() : null

    const feedbackPayload = {
      motifs: [...reasonCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([reason, n]) => ({ motif: clientRejectReasonLabel(reason as never, "fr"), occurrences: n })),
      commentaires: notes.slice(0, 20),
    }
    userContent = `MISSION :\n${JSON.stringify(missionPayload, null, 2)}\n\nHISTORIQUE DES AJUSTEMENTS (déjà appliqués — ne les refais pas) :\n${JSON.stringify(historyPayload, null, 2)}\n\nNOUVEAUX RETOURS DU CLIENT (candidats écartés, non encore traités) :\n${JSON.stringify(feedbackPayload, null, 2)}`
  } else {
    userContent = `MISSION :\n${JSON.stringify(missionPayload, null, 2)}\n\nHISTORIQUE DES AJUSTEMENTS (déjà appliqués — ne les refais pas) :\n${JSON.stringify(historyPayload, null, 2)}\n\nCONSIGNE DU SOURCEUR :\n${JSON.stringify({ instruction }, null, 2)}`
  }

  const orgLlm = await consumeOrgLlmActionForUser(getAdminSupabase(), user.id)
  if (!orgLlm.ok) {
    return NextResponse.json({ error: orgLlm.code ?? "llm_quota_exceeded", message: orgLlm.message }, { status: 429 })
  }

  let raw
  try {
    raw = await openrouterChat({
      model: "openai/gpt-4o-mini",
      temperature: 0.2,
      responseFormat: "json_object",
      maxTokens: 1500,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
    })
  } catch (err) {
    return NextResponse.json({ error: "llm_failed", detail: (err as Error).message }, { status: 502 })
  }

  const parsed = safeJsonParse<{ summary?: unknown; changes?: unknown; criteria?: unknown[] }>(raw.content)
  const knownTypes = new Set(Object.keys(CRITERION_CATALOG))
  const proposed: Criterion[] = []
  for (const item of Array.isArray(parsed?.criteria) ? parsed!.criteria! : []) {
    if (!item || typeof item !== "object") continue
    const r = item as Record<string, unknown>
    if (typeof r.type !== "string" || !knownTypes.has(r.type)) continue
    const c = normalizeCriterion({ ...r, type: r.type as CriterionType, source: "llm" })
    if (c) proposed.push(c)
  }

  const summary = typeof parsed?.summary === "string" ? parsed.summary.slice(0, 400) : ""
  const changes = Array.isArray(parsed?.changes)
    ? parsed!.changes.filter((c): c is string => typeof c === "string").map((c) => c.slice(0, 160)).slice(0, 6)
    : []

  return NextResponse.json({
    ok: true,
    source,
    summary,
    changes,
    criteria: capCriteria(proposed),
    ...(source === "feedback" ? { feedback_watermark: feedbackWatermark } : {}),
    ...(source === "general" ? { instruction } : {}),
  })
}
