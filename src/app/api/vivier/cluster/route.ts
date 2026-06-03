/**
 * POST /api/vivier/cluster
 *
 * Lance un passage de clustering du vivier par Nora. La LLM lit un snapshot
 * compact de TOUS les candidats parsés du sourceur, raisonne globalement,
 * et produit :
 *   - une liste de 3-8 secteurs (libellés libres, choisis par Nora en
 *     fonction de la réalité du vivier, pas une liste pré-imposée)
 *   - pour chaque candidat, 1 à 3 (rarement 4) assignations de cluster
 *     avec un poids ∈ [0.5, 1.0]
 *
 * Le résultat est persisté dans candidates.cluster_assignments. Le client
 * peut ensuite recharger sa liste pour voir la nouvelle carte.
 *
 * GET /api/vivier/cluster → retourne juste la dernière date de clustering
 * (NULL si jamais lancé) + le nombre de candidats classés / non-classés.
 */

import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { getAdminSupabase } from "@/lib/admin-supabase"
import { consumeQuota } from "@/lib/quota"
import { openrouterChat } from "@/lib/openrouter"
import type { Candidate, ClusterAssignment } from "@/lib/database.types"

export const runtime = "nodejs"
export const maxDuration = 60

/** Plafond candidats par passage. Au-delà on alerte le client — on
 *  ajoutera le batching si nécessaire. */
const MAX_CANDIDATES_PER_RUN = 180

const SYSTEM_PROMPT = `Tu es Nora, l'assistante d'un cabinet de recrutement. On te confie le vivier de candidats du cabinet et tu dois le structurer en secteurs métier intuitifs pour le sourceur.

Règles d'organisation :
- Lis CHAQUE candidat dans son ensemble (titre, expériences, séniorité, compétences, formation) — pas seulement la première ligne.
- Décide TOI-MÊME des secteurs : nombre (3 à 8), libellés (français court, professionnel), granularité. Pas de liste pré-imposée — tu adaptes les secteurs à la réalité du vivier.
- Regroupe les profils proches dans un même secteur. Si tu vois 4 ingénieurs DevOps + 1 SRE, ils sont tous dans le même secteur.
- Si un profil hésite vraiment entre 2 ou 3 secteurs (profil hybride), assigne-le aux 2-3 secteurs concernés avec un poids dominant (le plus pertinent ≥ 0.7, le secondaire 0.5-0.69). Ne dépasse jamais 4 secteurs par candidat (extrêmement rare).
- Évite les hybrides artificiels : un étudiant qui a fait un stage en finance n'est pas un hybride "Étudiants + Quant", c'est un Étudiant (1 cluster, poids 1.0). Un Full Stack qui a touché du Generative AI n'est pas un ML Engineer, c'est un Fullstack.
- Préfère des libellés métier larges (ex. "Data Engineering", "Backend Software", "Cybersécurité", "Étudiants & Stagiaires") plutôt que des micro-niches.

Réponds en JSON strict :
{
  "clusters": [
    { "label": "..." },
    ...
  ],
  "assignments": {
    "<candidate_id>": [
      { "label": "Doit correspondre exactement à un label déclaré dans clusters", "weight": 0.5-1.0 },
      ...
    ],
    ...
  }
}

Le mapping assignments DOIT couvrir TOUS les candidats fournis (sans exception). Les labels assignés doivent strictement correspondre à un label déclaré dans clusters. Les poids sont des nombres en [0.5, 1.0].`

interface CandidateSnapshot {
  id: string
  current_title: string | null
  current_company: string | null
  years_experience: number | null
  seniority: string | null
  skills: string[]
  recent_experience: Array<{ title: string | null; company: string | null; description?: string | null }>
  education: Array<{ degree: string | null; field: string | null }>
  summary: string | null
}

function buildSnapshot(c: Candidate): CandidateSnapshot {
  const cv = c.parsed_cv ?? {}
  const recent = (cv.experience ?? [])
    .slice(0, 4)
    .map((e) => ({
      title: e.title ?? null,
      company: e.company ?? null,
      description: e.description ? e.description.slice(0, 200) : null,
    }))
  const education = (cv.education ?? []).slice(0, 3).map((e) => ({
    degree: e.degree ?? null,
    field: e.field ?? null,
  }))
  const skills = (c.taxonomy?.core_skills?.length
    ? c.taxonomy.core_skills
    : c.skills ?? []).slice(0, 12)
  return {
    id: c.id,
    current_title: c.current_title,
    current_company: c.current_company,
    years_experience: c.years_experience,
    seniority: c.seniority_level,
    skills,
    recent_experience: recent,
    education,
    summary: cv.summary ? cv.summary.slice(0, 280) : null,
  }
}

export async function GET() {
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })

  const { data: rows } = await sb
    .from("candidates")
    .select("cluster_assigned_at, cluster_assignments")
    .eq("user_id", user.id)
    .eq("parse_status", "parsed")
    .not("tags", "cs", "{ancien}")
  const list = rows ?? []
  const lastRun = list
    .map((r) => r.cluster_assigned_at)
    .filter((s): s is string => !!s)
    .sort()
    .at(-1) ?? null
  const classified = list.filter((r) => (r.cluster_assignments ?? []).length > 0).length
  return NextResponse.json({
    last_run: lastRun,
    classified,
    total: list.length,
  })
}

export async function POST(req: NextRequest) {
  void req
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })

  // 1) Quota — clustering = appel LLM lourd, on l'absorbe dans le bucket assistant.
  const quota = await consumeQuota(getAdminSupabase(), user.id, "assistant")
  if (!quota.ok) {
    return NextResponse.json({ error: "quota_exceeded", message: quota.message }, { status: 429 })
  }

  // 2) Charger le vivier parsé du user (hors candidats "ancien" archivés).
  const { data: rows, error: fetchErr } = await sb
    .from("candidates")
    .select("*")
    .eq("user_id", user.id)
    .eq("parse_status", "parsed")
    .not("tags", "cs", "{ancien}")
    .order("created_at", { ascending: false })
  if (fetchErr) {
    return NextResponse.json({ error: "fetch_failed", detail: fetchErr.message }, { status: 500 })
  }
  const candidates = (rows ?? []) as Candidate[]
  if (candidates.length === 0) {
    return NextResponse.json({ error: "empty_vivier", message: "Aucun candidat parsé dans le vivier." }, { status: 400 })
  }
  if (candidates.length > MAX_CANDIDATES_PER_RUN) {
    return NextResponse.json({
      error: "vivier_too_large",
      message: `Le vivier dépasse ${MAX_CANDIDATES_PER_RUN} candidats. Le batching n'est pas encore en place — contactez le support.`,
    }, { status: 400 })
  }

  // 3) Construire le snapshot compact à envoyer au LLM.
  const snapshots = candidates.map(buildSnapshot)

  // 4) Appel LLM — JSON strict.
  let parsed: { clusters?: Array<{ label?: unknown }>; assignments?: Record<string, Array<{ label?: unknown; weight?: unknown }>> }
  try {
    const result = await openrouterChat({
      model: "openai/gpt-4o-mini",
      temperature: 0.2,
      maxTokens: 6000,
      timeoutMs: 55_000,
      responseFormat: "json_object",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Voici les candidats à structurer en secteurs (n=${snapshots.length}).\n\n${JSON.stringify(snapshots, null, 2)}` },
      ],
    })
    parsed = JSON.parse(result.content) as typeof parsed
  } catch (err) {
    return NextResponse.json(
      { error: "llm_failed", detail: (err as Error).message },
      { status: 502 },
    )
  }

  // 5) Validation de la réponse.
  const declaredLabels = new Set<string>()
  for (const c of parsed.clusters ?? []) {
    if (typeof c?.label === "string" && c.label.trim().length > 0) {
      declaredLabels.add(c.label.trim())
    }
  }
  if (declaredLabels.size < 1) {
    return NextResponse.json({ error: "no_clusters", detail: "Nora n'a déclaré aucun cluster." }, { status: 502 })
  }

  const now = new Date().toISOString()
  const updates: Array<{ id: string; assignments: ClusterAssignment[] }> = []
  for (const cand of candidates) {
    const raw = parsed.assignments?.[cand.id] ?? []
    const clean: ClusterAssignment[] = []
    for (const item of raw) {
      const label = typeof item?.label === "string" ? item.label.trim() : ""
      const weight = typeof item?.weight === "number" ? item.weight : NaN
      if (!declaredLabels.has(label)) continue
      if (!Number.isFinite(weight)) continue
      const w = Math.max(0.5, Math.min(1.0, Number(weight.toFixed(2))))
      if (clean.some((c) => c.label === label)) continue
      clean.push({ label, weight: w })
    }
    if (clean.length === 0) continue
    if (clean.length > 4) clean.length = 4
    // Tri par poids décroissant pour que .primary lisible reste le plus pertinent.
    clean.sort((a, b) => b.weight - a.weight)
    updates.push({ id: cand.id, assignments: clean })
  }

  if (updates.length === 0) {
    return NextResponse.json({ error: "no_assignments", detail: "Aucune assignation valide." }, { status: 502 })
  }

  // 6) Persiste les assignations en parallèle (admin client — bypass RLS pour
  //    écrire en masse, scoped sur user.id par le filtre).
  const admin = getAdminSupabase()
  const results = await Promise.all(updates.map((u) =>
    admin
      .from("candidates")
      .update({ cluster_assignments: u.assignments, cluster_assigned_at: now })
      .eq("id", u.id)
      .eq("user_id", user.id),
  ))
  const failed = results.filter((r) => r.error).length

  return NextResponse.json({
    ok: true,
    clusters: Array.from(declaredLabels),
    classified: updates.length,
    total: candidates.length,
    failed,
    last_run: now,
  })
}
