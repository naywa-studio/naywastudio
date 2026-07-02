/**
 * POST /api/jobs/:id/propose-criteria
 *
 * Nora analyse la mission (titre / description / briefing / normalized)
 * et propose une sélection de critères depuis le catalogue (4-5 main +
 * 3-5 bonus). N'écrit RIEN en DB — c'est le PATCH /criteria qui
 * persiste après validation/édition du sourceur.
 *
 * Cap dur 5 main + 5 bonus côté serveur (capCriteria).
 */

import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { getAdminSupabase } from "@/lib/admin-supabase"
import { consumeOrgLlmActionForUser } from "@/lib/quota"
import { openrouterChat, safeJsonParse } from "@/lib/openrouter"
import {
  CRITERION_CATALOG,
  capCriteria,
  normalizeCriterion,
  type Criterion,
  type CriterionType,
} from "@/lib/job-criteria-catalog"
import type { Job } from "@/lib/database.types"

export const runtime = "nodejs"
export const maxDuration = 30

const SYSTEM_PROMPT = buildSystemPrompt()

function buildSystemPrompt(): string {
  const catalog = Object.entries(CRITERION_CATALOG)
    .map(([type, entry]) => {
      const params = entry.paramKeys.length > 0
        ? ` — params autorisés : ${entry.paramKeys.join(", ")}`
        : ""
      return `- ${type} (${entry.kind})${params}\n  → ${entry.llmHint}`
    })
    .join("\n\n")

  return `Tu es l'expert de matching recrutement Naywa. À partir d'une mission, tu proposes une liste de CRITÈRES de matching que le sourceur validera.

CATALOGUE DE TYPES DISPONIBLES (n'invente RIEN d'autre — sauf "custom" en dernier recours) :

${catalog}

RÈGLES
1. Lis la mission EN ENTIER (titre, description, briefing, skills, normalized) avant de proposer.
2. Propose 4-5 critères "main" (essentiels au scoring) et 3-5 "bonus" (informatifs, non bloquants).
3. SKILLS est quasi toujours main (sauf mission pure soft skills).
4. LANGUES — RÈGLE STRICTE : chaque langue explicitement EXIGÉE dans la mission = UN critère "language" distinct, en **"main"** dès que le brief la présente comme requise/indispensable (formulations type "parfaite aisance en X", "maîtrise de X", "X courant", "bilingue X", "X et Y exigés"). Un critère "language" par langue (ex : "parfaite aisance en Français ET Anglais" → DEUX critères main : Français + Anglais). Ne mets une langue en "bonus" QUE si le brief la dit "appréciée"/"un plus". N'oublie JAMAIS une langue mentionnée dans le brief.
5. Si elle mentionne un permis / habilitation / certification → crée le critère correspondant.
6. Pour les critères qualitatifs (language, license, certification, etc.), remplis les params avec les valeurs extraites du brief ("Allemand B2 requis" → { code: "de", level_min: "B2" } ; "parfaite aisance en anglais" → { code: "en", level_min: "C1" }).
7. "custom" UNIQUEMENT si AUCUN type ne couvre le besoin (rare).
8. Le label doit être PRÉCIS et human-readable ("Compétences Spark / Airflow", pas "Compétences techniques").
9. N'inclus PAS d'id (le serveur en génère un).

RÉPONDS UNIQUEMENT EN JSON :
{
  "criteria": [
    {
      "type": "skills" | "language" | ... (cf catalogue),
      "label": "string court",
      "weight": "main" | "bonus",
      "params": { ... selon le type }
    },
    ...
  ]
}`
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })

  const { data: jobRow } = await sb.from("jobs").select("*").eq("id", id).maybeSingle()
  if (!jobRow) return NextResponse.json({ error: "not_found" }, { status: 404 })
  const job = jobRow as Job

  const orgLlm = await consumeOrgLlmActionForUser(getAdminSupabase(), user.id)
  if (!orgLlm.ok) {
    return NextResponse.json(
      { error: orgLlm.code ?? "llm_quota_exceeded", message: orgLlm.message },
      { status: 429 },
    )
  }

  const missionPayload = {
    role: job.role_name?.trim() || job.title,
    location: job.location,
    seniority: job.seniority ?? job.normalized?.seniority ?? null,
    contract_type: job.contract_type,
    required_skills: job.required_skills ?? [],
    nice_to_have_skills: job.nice_to_have_skills ?? [],
    description: job.description ?? null,
    briefing: job.briefing ?? null,
    normalized: job.normalized ?? null,
  }

  let raw
  try {
    raw = await openrouterChat({
      model: "openai/gpt-4o-mini",
      temperature: 0.1,
      responseFormat: "json_object",
      maxTokens: 1400,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `MISSION :\n${JSON.stringify(missionPayload, null, 2)}` },
      ],
    })
  } catch (err) {
    return NextResponse.json(
      { error: "llm_failed", detail: (err as Error).message },
      { status: 502 },
    )
  }

  const parsed = safeJsonParse<{ criteria?: unknown[] }>(raw.content)
  const list = Array.isArray(parsed?.criteria) ? parsed!.criteria : []
  const validatedKnownTypes = new Set(Object.keys(CRITERION_CATALOG))

  const proposed: Criterion[] = []
  for (const item of list) {
    if (!item || typeof item !== "object") continue
    const r = item as Record<string, unknown>
    if (typeof r.type !== "string" || !validatedKnownTypes.has(r.type)) continue
    // Force source = "llm" + id généré.
    const c = normalizeCriterion({
      ...r,
      type: r.type as CriterionType,
      source: "llm",
    })
    if (c) proposed.push(c)
  }

  return NextResponse.json({ ok: true, criteria: capCriteria(proposed) })
}
