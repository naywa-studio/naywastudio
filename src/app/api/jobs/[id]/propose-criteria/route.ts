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
1. Lis la mission EN ENTIER (titre, description, briefing = brief BRUT du client, skills, normalized) avant de proposer. Le "briefing" est le texte original le plus riche : exploite-le en priorité.

2. Propose 4-5 critères "main" (comptent dans le score) et 2-4 "bonus" (informatifs, non bloquants).

3. UN SEUL critère "skills". Regroupe TOUTES les compétences techniques/métier générales en un unique critère "skills" (params.must = must-have, params.nice = souhaitées — liste EXHAUSTIVE des compétences du brief). Ne crée JAMAIS deux critères "skills".

3bis. TECHNOS SPÉCIFIQUES → CRITÈRE "custom" DÉDIÉ. Une technologie/outil précis et différenciant exigé par le client (ex : Kafka, Azure, Spark, Salesforce, SAP, Snowflake, Terraform…) mérite un critère "custom" À PART, en plus de sa présence dans params.must du critère skills, pour un scoring individuel. params.description = la techno ("Maîtrise de Kafka"). 1 à 3 max, en "main" si vraiment critique sinon "bonus". Ça permet au sourceur de filtrer précisément sur "a Kafka".

4. DIVERSIFIE LES TYPES — c'est la règle la plus importante. Un bon set de critères couvre PLUSIEURS dimensions du besoin, pas seulement les compétences. Après le critère "skills", balaie le brief et ajoute un critère du TYPE DÉDIÉ pour chaque dimension présente :
   - langue(s) exigée(s) → "language" (un critère par langue)
   - niveau d'études / école demandé → "diploma"
   - secteur / domaine métier (immobilier, fintech, santé…) → "domain_fit" (ou "role_fit" si c'est l'adéquation au métier précis)
   - type de contrat imposé (alternance, CDI, freelance…) → "contract_preference"
   - années d'expérience / séniorité → "experience_years" / "seniority_fit"
   - interface client, management, mobilité, permis, certif, habilitation… → le type dédié
   Deux critères "main" ne doivent JAMAIS porter la MÊME dimension (hors langues multiples). Si tu te retrouves avec deux critères du même type (autre que "language"), fusionne-les ou remplace-en un par le bon type. Un set qui n'est QUE des "skills" est un échec.

5. LANGUES — STRICT : chaque langue exigée (repérée dans le brief, required_skills OU nice_to_have_skills : "parfaite aisance en X", "maîtrise de X", "X courant", "bilingue X", "communication en X") = UN critère "language" distinct en "main". "parfaite aisance en Français ET Anglais" → DEUX critères main (fr + en). N'oublie JAMAIS une langue. Ne mets une langue en "bonus" QUE si le brief la dit explicitement "appréciée"/"un plus".

6. Permis / habilitation / certification / diplôme précis → le type dédié correspondant.

7. Pour les qualitatifs, remplis params depuis le brief ("Anglais courant" → { code: "en", level_min: "C1" } ; "Bac+5 école de commerce" → { level: "bac+5", field: "commerce" } ; "alternance" → { kinds: ["alternance"] }).

8. "custom" UNIQUEMENT si aucun type ne couvre (rare).

9. Label court et PRÉCIS ("Compétences commerciales", "Immobilier / luxe" — pas le libellé générique "Compétences techniques"). N'inclus PAS d'id.

EXEMPLE — brief "Alternant commercial en immobilier au siège à Paris, parfaite aisance à l'oral et à l'écrit en Français ET Anglais, Bac+4/5 école de commerce, sensible au luxe et à l'immobilier haut de gamme, maîtrise du pack office" →
{
  "criteria": [
    { "type": "skills", "label": "Compétences commerciales", "weight": "main", "params": { "must": ["prospection", "négociation", "relation client", "closing"], "nice": ["CRM Salesforce", "pack office"] } },
    { "type": "language", "label": "Français", "weight": "main", "params": { "code": "fr", "level_min": "C2" } },
    { "type": "language", "label": "Anglais", "weight": "main", "params": { "code": "en", "level_min": "C1" } },
    { "type": "domain_fit", "label": "Immobilier / luxe", "weight": "main", "params": { "domains": ["immobilier", "luxe"] } },
    { "type": "diploma", "label": "Bac+4/5 commerce", "weight": "main", "params": { "level": "bac+5", "field": "commerce" } },
    { "type": "contract_preference", "label": "Alternance", "weight": "bonus", "params": { "kinds": ["alternance"] } }
  ]
}

RÉPONDS UNIQUEMENT EN JSON, MÊME STRUCTURE que l'exemple.`
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
