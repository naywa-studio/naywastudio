/**
 * POST /api/jobs/:id/feedback-adjust   (lot 3c — Nora réajuste la mission)
 *
 * Nora lit les RETOURS DU CLIENT sur les candidats écartés (motifs +
 * commentaires libres) + les critères actuels de la mission, et propose une
 * version RÉVISÉE des critères qui répond à ces retours. N'écrit RIEN : le
 * sourceur applique via PATCH /criteria (qui relance le matching) ou ignore.
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
  type Criterion, type CriterionType,
} from "@/lib/job-criteria-catalog"
import { clientRejectReasonLabel, isClientRejectReason } from "@/lib/client-reject-reasons"
import type { Job } from "@/lib/database.types"

export const runtime = "nodejs"
export const maxDuration = 30

function buildSystemPrompt(): string {
  const catalog = Object.entries(CRITERION_CATALOG)
    .map(([type, entry]) => `- ${type} (${entry.kind})${entry.paramKeys.length ? ` — params : ${entry.paramKeys.join(", ")}` : ""}`)
    .join("\n")
  return `Tu es Nora, l'assistante de matching recrutement Naywa. Le sourceur a présenté des candidats à son client, qui en a ÉCARTÉ certains en donnant des motifs et des commentaires. Ton rôle : proposer une VERSION RÉVISÉE des critères de la mission qui tienne compte de ces retours, pour améliorer le prochain matching.

CATALOGUE DE TYPES (n'invente rien d'autre, sauf "custom" en dernier recours) :
${catalog}

RÈGLES
- Pars des critères ACTUELS et ajuste-les au minimum nécessaire : renforce une compétence jugée manquante, ajuste le niveau de séniorité/expérience, ajoute un critère dédié si un motif récurrent le justifie. Ne repars pas de zéro.
- Garde UN SEUL critère "skills" (params.must / params.nice).
- 4-5 critères "main" max + quelques "bonus". Reste proportionné aux retours : peu de retours = peu de changements.
- Chaque changement doit répondre à un motif client concret.

RÉPONDS EN JSON STRICT :
{
  "summary": "1-2 phrases en français : ce que tu ajustes et pourquoi (ton posé, factuel).",
  "changes": ["puce courte décrivant un changement", "..."],
  "criteria": [ /* liste COMPLÈTE révisée des critères, format catalogue */ ]
}`
}

const SYSTEM_PROMPT = buildSystemPrompt()

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })
  const gate = await requireActiveAccess()
  if (!gate.ok) return gate.response

  const { data: jobRow, error: jobErr } = await sb.from("jobs").select("*").eq("id", id).single()
  if (jobErr || !jobRow) return NextResponse.json({ error: "not_found" }, { status: 404 })
  const job = jobRow as Job

  // Retours client des candidats écartés (RLS org-scopé).
  const { data: rejected } = await sb
    .from("match_assessments")
    .select("client_reject_reasons, client_feedback_note")
    .eq("job_id", id)
    .eq("pipeline_stage", "rejected")

  const reasonCounts = new Map<string, number>()
  const notes: string[] = []
  for (const r of rejected ?? []) {
    for (const raw of (r.client_reject_reasons ?? [])) {
      if (isClientRejectReason(raw)) reasonCounts.set(raw, (reasonCounts.get(raw) ?? 0) + 1)
    }
    const note = (r.client_feedback_note ?? "").trim()
    if (note) notes.push(note)
  }

  if (reasonCounts.size === 0 && notes.length === 0) {
    return NextResponse.json({ ok: true, no_feedback: true })
  }

  const orgLlm = await consumeOrgLlmActionForUser(getAdminSupabase(), user.id)
  if (!orgLlm.ok) {
    return NextResponse.json({ error: orgLlm.code ?? "llm_quota_exceeded", message: orgLlm.message }, { status: 429 })
  }

  const feedbackPayload = {
    motifs: [...reasonCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([reason, n]) => ({ motif: clientRejectReasonLabel(reason as never, "fr"), occurrences: n })),
    commentaires: notes.slice(0, 20),
  }
  const missionPayload = {
    role: job.role_name?.trim() || job.title,
    seniority: job.seniority ?? job.normalized?.seniority ?? null,
    criteres_actuels: job.criteria ?? [],
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
        { role: "user", content: `MISSION :\n${JSON.stringify(missionPayload, null, 2)}\n\nRETOURS DU CLIENT (candidats écartés) :\n${JSON.stringify(feedbackPayload, null, 2)}` },
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

  return NextResponse.json({ ok: true, summary, changes, criteria: capCriteria(proposed) })
}
