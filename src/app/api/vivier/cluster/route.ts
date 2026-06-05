/**
 * POST /api/vivier/cluster
 *
 * Vivier clustering avec mémoire. Nora :
 *   1. Lit le manifeste des zones déjà créées pour cette org — une courte
 *      description "qui ressemble à ça". Elle évite ainsi de re-scanner
 *      tous les CVs pour décider où ranger un nouveau profil.
 *   2. Pour chaque candidat (existant ou nouvellement arrivé), elle décide :
 *      soit l'assigne à une zone existante (case standard, peu coûteux),
 *      soit le marque "orphelin" si vraiment rien ne correspond.
 *   3. Si ≥ 3 orphelins forment un domaine cohérent absent du manifeste,
 *      elle crée UNE nouvelle zone (avec sa description) et y range les
 *      orphelins concernés. Pas d'orphelins esseulés inventés.
 *
 * Règles dures :
 *   - Pas de cluster "Étudiants" / "Stagiaires" / "Alternants" — un débutant
 *     va dans son cluster métier. is_apprentice est un BADGE sur la fiche,
 *     pas une zone.
 *   - Regarde la TRAJECTOIRE (3-4 dernières XP + formation), pas seulement
 *     le current_title.
 *
 * GET /api/vivier/cluster → état (dernière exécution, classés, total).
 */

import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { getAdminSupabase } from "@/lib/admin-supabase"
import { consumeQuota } from "@/lib/quota"
import { openrouterChat } from "@/lib/openrouter"
import { getCabinetOrgId } from "@/lib/cabinet-config"
import type { Candidate, ClusterAssignment } from "@/lib/database.types"

export const runtime = "nodejs"
export const maxDuration = 60

const MAX_CANDIDATES_PER_RUN = 180

const SYSTEM_PROMPT = `Tu es Nora, l'assistante d'un cabinet de recrutement. On te confie le vivier de candidats du cabinet et tu dois le structurer en secteurs métier intuitifs pour le sourceur.

CONTEXTE : ton interlocuteur travaille avec un vivier "vivant". À chaque passage, on te donne :
- les ZONES déjà créées par les passages précédents (avec leur description : "qui ressemble à ça")
- la liste actuelle des candidats parsés

Ta mission :
1. Pour CHAQUE candidat, regarde son ensemble (titre actuel + 3-4 dernières expériences + compétences + formation), PAS juste son titre.
2. Si le candidat colle à une zone existante, assigne-le à cette zone. C'est le cas normal — réutilise au maximum les zones existantes.
3. Si un profil hybride hésite vraiment entre 2 zones existantes, assigne-le aux 2 (poids dominant ≥ 0.7, secondaire 0.5-0.69). Max 3 zones par candidat — 4 absolument exceptionnel.
4. Si AUCUNE zone existante ne convient ET qu'il existe ≥ 3 candidats qui forment un domaine cohérent absent, crée UNE nouvelle zone avec sa description. Ne crée jamais de zone pour 1 ou 2 candidats isolés (mets-les dans la zone la plus proche, même si imparfaite, en réduisant le poids à 0.5-0.6).

RÈGLES DURES — INTERDICTIONS :
- INTERDIT : créer un cluster "Étudiants & Stagiaires", "Alternance", "Apprentissage", "Juniors" ou tout cluster qui dépend d'un STATUT ou d'une SÉNIORITÉ. Les débutants vont dans leur cluster MÉTIER (un Junior Data Engineer = "Data Engineering", un Apprenti Dev Backend = "Backend Software"). is_apprentice est un badge sur la fiche, pas une zone.
- INTERDIT : créer une zone pour 1 ou 2 candidats isolés. Mets-les dans la zone la plus proche existante.
- INTERDIT : assigner un candidat à une zone dont le label n'est pas dans la liste {existantes ∪ nouvellement créées dans CE passage}.
- INTERDIT : changer le label d'une zone existante ; tu peux UTILISER son label, pas le réécrire.

Quand tu CRÉES une nouvelle zone, fournis :
- label : court, français, professionnel (ex. "Cybersécurité", "Backend Software", "Data Engineering")
- description : 2-3 phrases "qui ressemble à ça" — ce qui caractérise les profils de cette zone (métier + 2-3 outils/techno + signaux clés). Cette description sera relue par tes futurs passages pour décider du rangement, soigne-la.

Réponds en JSON strict :
{
  "new_clusters": [
    { "label": "...", "description": "..." }
  ],
  "assignments": {
    "<candidate_id>": [
      { "label": "doit correspondre à une zone existante OU créée dans ce passage", "weight": 0.5-1.0 }
    ]
  }
}

assignments DOIT couvrir TOUS les candidats fournis. Si tu n'es vraiment pas sûr pour un candidat, force-toi à choisir la zone la plus proche avec un poids 0.5.`

interface CandidateSnapshot {
  id: string
  current_title: string | null
  current_company: string | null
  years_experience: number | null
  seniority: string | null
  is_apprentice: boolean
  skills: string[]
  recent_experience: Array<{ title: string | null; company: string | null; description?: string | null }>
  education: Array<{ degree: string | null; field: string | null }>
  summary: string | null
}

interface ExistingManifest {
  label: string
  description: string
  candidate_count: number
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
    is_apprentice: c.is_apprentice === true,
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

  // RLS-scoped — returns rows of the caller's org.
  const { data: rows } = await sb
    .from("candidates")
    .select("cluster_assigned_at, cluster_assignments")
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

  const orgId = await getCabinetOrgId(sb, user.id)
  if (!orgId) return NextResponse.json({ error: "no_org" }, { status: 404 })

  // 1) Quota — clustering = appel LLM lourd, on l'absorbe dans le bucket assistant.
  const quota = await consumeQuota(getAdminSupabase(), user.id, "assistant")
  if (!quota.ok) {
    return NextResponse.json({ error: "quota_exceeded", message: quota.message }, { status: 429 })
  }

  // 2) Charger les candidats de l'org (RLS org-scoped).
  const { data: rows, error: fetchErr } = await sb
    .from("candidates")
    .select("*")
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

  // 3) Charger les manifestes existants (vivier vivant).
  const { data: manifestRows } = await sb
    .from("cluster_manifests")
    .select("label, description, candidate_count")
    .eq("organization_id", orgId)
  const existingManifests: ExistingManifest[] = (manifestRows ?? []) as ExistingManifest[]

  // 4) Snapshot des candidats.
  const snapshots = candidates.map(buildSnapshot)

  // 5) Appel LLM — JSON strict, manifestes en contexte.
  let parsed: {
    new_clusters?: Array<{ label?: unknown; description?: unknown }>
    assignments?: Record<string, Array<{ label?: unknown; weight?: unknown }>>
  }
  try {
    const userContent = [
      `ZONES EXISTANTES (créées lors des passages précédents, à réutiliser au maximum) :`,
      existingManifests.length > 0
        ? JSON.stringify(existingManifests, null, 2)
        : "(aucune — c'est le premier passage de clustering)",
      "",
      `CANDIDATS À RANGER (n=${snapshots.length}) :`,
      JSON.stringify(snapshots, null, 2),
    ].join("\n")
    const result = await openrouterChat({
      model: "openai/gpt-4o-mini",
      temperature: 0.2,
      maxTokens: 6000,
      timeoutMs: 55_000,
      responseFormat: "json_object",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
    })
    parsed = JSON.parse(result.content) as typeof parsed
  } catch (err) {
    return NextResponse.json(
      { error: "llm_failed", detail: (err as Error).message },
      { status: 502 },
    )
  }

  // 6) Validation : ensemble des labels disponibles = existants ∪ nouveaux.
  const allowedLabels = new Map<string, { description: string; isNew: boolean }>()
  for (const m of existingManifests) {
    allowedLabels.set(m.label, { description: m.description, isNew: false })
  }
  const newManifests: Array<{ label: string; description: string }> = []
  for (const c of parsed.new_clusters ?? []) {
    const label = typeof c?.label === "string" ? c.label.trim() : ""
    const description = typeof c?.description === "string" ? c.description.trim() : ""
    if (!label || !description) continue
    // Refuse un label qui re-déclare une zone existante.
    if (allowedLabels.has(label)) continue
    allowedLabels.set(label, { description, isNew: true })
    newManifests.push({ label, description })
  }
  if (allowedLabels.size === 0) {
    return NextResponse.json({ error: "no_clusters", detail: "Nora n'a déclaré aucune zone." }, { status: 502 })
  }

  // 7) Nettoyage des assignations.
  const now = new Date().toISOString()
  const updates: Array<{ id: string; assignments: ClusterAssignment[] }> = []
  const labelCounts = new Map<string, number>()
  for (const cand of candidates) {
    const raw = parsed.assignments?.[cand.id] ?? []
    const clean: ClusterAssignment[] = []
    for (const item of raw) {
      const label = typeof item?.label === "string" ? item.label.trim() : ""
      const weight = typeof item?.weight === "number" ? item.weight : NaN
      if (!allowedLabels.has(label)) continue
      if (!Number.isFinite(weight)) continue
      const w = Math.max(0.5, Math.min(1.0, Number(weight.toFixed(2))))
      if (clean.some((c) => c.label === label)) continue
      clean.push({ label, weight: w })
    }
    if (clean.length === 0) continue
    if (clean.length > 4) clean.length = 4
    clean.sort((a, b) => b.weight - a.weight)
    updates.push({ id: cand.id, assignments: clean })
    for (const a of clean) labelCounts.set(a.label, (labelCounts.get(a.label) ?? 0) + 1)
  }

  if (updates.length === 0) {
    return NextResponse.json({ error: "no_assignments", detail: "Aucune assignation valide." }, { status: 502 })
  }

  // 8) Persiste les assignations (admin pour bypass RLS sur écriture en masse).
  const admin = getAdminSupabase()
  const updateResults = await Promise.all(updates.map((u) =>
    admin
      .from("candidates")
      .update({ cluster_assignments: u.assignments, cluster_assigned_at: now })
      .eq("id", u.id)
      .eq("organization_id", orgId),
  ))
  const failed = updateResults.filter((r) => r.error).length

  // 9) Persiste / met à jour les manifestes pour la prochaine passe.
  //    Upsert avec UNIQUE (organization_id, label).
  const manifestRowsToUpsert = Array.from(allowedLabels.entries()).map(([label, info]) => ({
    organization_id: orgId,
    label,
    description: info.description,
    candidate_count: labelCounts.get(label) ?? 0,
  }))
  if (manifestRowsToUpsert.length > 0) {
    await admin
      .from("cluster_manifests")
      .upsert(manifestRowsToUpsert, { onConflict: "organization_id,label" })
  }

  return NextResponse.json({
    ok: true,
    clusters: Array.from(allowedLabels.keys()),
    new_clusters: newManifests.map((m) => m.label),
    classified: updates.length,
    total: candidates.length,
    failed,
    last_run: now,
  })
}
