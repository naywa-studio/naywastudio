/**
 * POST /api/jobs/:id/propose-sectors
 *
 * Nora lit la mission (titre / description / briefing / critères / normalized)
 * et propose 1 à 4 SECTEURS cibles pour matcher le vivier. Elle réutilise en
 * priorité les secteurs existants de l'org (mêmes noms que ceux qui rangent le
 * vivier) pour que le gate opère correctement.
 *
 * N'écrit RIEN : c'est le panneau "Matcher le vivier" qui persiste le choix
 * final (édité par l'user) dans jobs.target_sectors au lancement du match.
 */

import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { getAdminSupabase } from "@/lib/admin-supabase"
import { consumeOrgLlmActionForUser } from "@/lib/quota"
import { openrouterChat, safeJsonParse } from "@/lib/openrouter"
import type { Job } from "@/lib/database.types"
import type { Criterion } from "@/lib/job-criteria-catalog"

export const runtime = "nodejs"
export const maxDuration = 30

const SYSTEM_PROMPT = `Tu es l'assistante de sourcing Naywa. À partir d'une mission, tu proposes les SECTEURS (domaines métier) dans lesquels chercher les candidats du vivier.

RÈGLES
1. Propose 1 à 4 secteurs cibles, du plus pertinent au moins pertinent. Sois PRÉCIS : uniquement les domaines vraiment pertinents pour cette mission.
2. Réutilise EN PRIORITÉ les secteurs existants fournis (liste ci-dessous) — mêmes noms exacts. Ne propose un NOUVEAU secteur QUE si aucun existant ne couvre le besoin.
3. Un secteur = domaine métier LARGE (ex : "Commercial", "Immobilier", "Finance", "Marketing", "RH", "Data / Cloud", "Ingénierie", "Juridique", "Santé"). JAMAIS un intitulé de poste ni une techno.
4. Une mission peut légitimement viser plusieurs secteurs (profil recherché hybride, ex : commercial dans l'immobilier → "Commercial" ET "Immobilier").

RÉPONDS UNIQUEMENT EN JSON : { "sectors": ["...", "..."] }`

function normalizeSectors(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const x of raw) {
    const s = String(x).trim()
    if (!s || s.length > 40) continue
    const k = s.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    out.push(s)
    if (out.length >= 4) break
  }
  return out
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })

  const { data: jobRow } = await sb.from("jobs").select("*").eq("id", id).maybeSingle()
  if (!jobRow) return NextResponse.json({ error: "not_found" }, { status: 404 })
  const job = jobRow as Job

  // Secteurs existants de l'org (RLS-scoped) — Nora réutilise ces noms.
  const { data: sectorRows } = await sb.from("sectors").select("name").order("name")
  const existing = (sectorRows ?? []).map((s) => s.name)

  const orgLlm = await consumeOrgLlmActionForUser(getAdminSupabase(), user.id)
  if (!orgLlm.ok) {
    return NextResponse.json(
      { error: orgLlm.code ?? "llm_quota_exceeded", message: orgLlm.message },
      { status: 429 },
    )
  }

  const criteria = (job.criteria ?? []) as Criterion[]
  const missionPayload = {
    role: job.role_name?.trim() || job.title,
    location: job.location,
    seniority: job.seniority ?? job.normalized?.seniority ?? null,
    contract_type: job.contract_type,
    required_skills: job.required_skills ?? [],
    description: job.description ?? null,
    briefing: job.briefing ?? null,
    criteres: criteria.map((c) => c.label),
  }
  const existingLine = existing.length > 0
    ? existing.join(", ")
    : "(aucun secteur existant — tu peux en proposer)"

  let raw
  try {
    raw = await openrouterChat({
      model: "openai/gpt-4o-mini",
      temperature: 0.1,
      responseFormat: "json_object",
      maxTokens: 200,
      timeoutMs: 15_000,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `SECTEURS EXISTANTS : ${existingLine}\n\nMISSION :\n${JSON.stringify(missionPayload, null, 2)}` },
      ],
    })
  } catch (err) {
    return NextResponse.json({ error: "llm_failed", detail: (err as Error).message }, { status: 502 })
  }

  const parsed = safeJsonParse<{ sectors?: unknown }>(raw.content)
  const sectors = normalizeSectors(parsed?.sectors)
  return NextResponse.json({ ok: true, sectors })
}
