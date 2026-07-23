/**
 * POST /api/vivier/cluster — clustering du vivier (Sprint B).
 *
 * 2 modes :
 *
 *  1) PREMIER RUN (taxonomie vide ou réduite à "Autre")
 *     - Le 1er batch laisse Nora PROPOSER des zones, avec un cap dynamique
 *       (cf. lib/cluster-taxonomy.ts maxZonesForVivierSize). Pour 10 CVs
 *       elle propose 1 zone (= Autre), pour 200 CVs jusqu'à 15.
 *     - Les batches suivants du même run sont en mode CLOSED : ils ne
 *       peuvent qu'assigner aux zones proposées au 1er batch (cohérence).
 *
 *  2) RUNS SUIVANTS (taxonomie déjà établie)
 *     - Mode CLOSED uniquement : Nora choisit dans la liste des zones de
 *       l'org. Si rien ne colle vraiment pour un candidat → "Autre".
 *     - Les zones ne sont JAMAIS créées par le LLM dans ce mode. Le
 *       sourceur les crée/édite/supprime via /api/vivier/zones.
 *
 * La zone système "Autre" est toujours présente (créée à la volée si
 * manquante). Non supprimable côté CRUD.
 *
 * GET /api/vivier/cluster → état (dernière exécution, classés, total).
 */

import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { getAdminSupabase } from "@/lib/admin-supabase"
import { requireActiveAccess } from "@/lib/access-guard"
import { consumeQuota, consumeOrgLlmActionForUser } from "@/lib/quota"
import { openrouterChat } from "@/lib/openrouter"
import {
  FALLBACK_ZONE_LABEL,
  MAX_ZONES_PER_ORG,
  maxZonesForVivierSize,
} from "@/lib/cluster-taxonomy"
import type { Candidate, ClusterAssignment } from "@/lib/database.types"

export const runtime = "nodejs"
export const maxDuration = 300

const CLUSTER_BATCH_SIZE = 50
const MAX_CANDIDATES_PER_RUN = 900

const FALLBACK_DESCRIPTION =
  "Zone système. Reçoit les candidats qui ne correspondent à aucune des zones définies de votre organisation. Toujours présente, non supprimable. Réorganisez vos zones ou créez-en de nouvelles pour la vider."

const COMMON_RULES = `RÈGLES DURES :
- INTERDIT de créer un cluster basé sur statut/séniorité ("Étudiants & Stagiaires", "Alternance", "Juniors"). Les débutants vont dans leur cluster MÉTIER (un Junior Data Engineer va dans "Data Engineering"). is_apprentice est un BADGE, pas une zone.
- INTERDIT de changer le label d'une zone existante. Tu peux UTILISER son label, pas le réécrire.
- assignments DOIT couvrir TOUS les candidats fournis. Si vraiment rien ne colle pour un candidat, mets-le dans "${FALLBACK_ZONE_LABEL}" avec un poids 0.5.`

function firstRunSystemPrompt(maxZones: number): string {
  return `Tu es Nora, l'assistante d'un cabinet de recrutement. C'est le PREMIER passage de clustering : tu vas définir les zones métier de ce vivier (taxonomie de base) ET y ranger les candidats.

CAP STRICT : maximum ${maxZones} zones AU TOTAL (incluant la zone "${FALLBACK_ZONE_LABEL}" qui existe par défaut). Le sourceur pourra créer d'autres zones manuellement plus tard si besoin.

Ta mission :
1. Pour CHAQUE candidat, analyse l'ensemble (titre + 3-4 dernières XP + compétences + formation), PAS juste le titre.
2. Identifie 1 à ${maxZones - 1} grandes familles métier cohérentes dans ce vivier. Chaque famille doit regrouper au moins 3 candidats. Si tu ne vois pas ${maxZones - 1} familles cohérentes, propose-en moins — la qualité prime sur la quantité.
3. Assigne chaque candidat à sa famille. Un profil hybride peut être assigné à 2 zones (poids dominant ≥ 0.7, secondaire 0.5-0.69). Max 3 zones par candidat.
4. Les candidats isolés (sans famille de ≥3) vont dans "${FALLBACK_ZONE_LABEL}".

Quand tu CRÉES une zone, fournis :
- label : court, français, professionnel (ex. "Data Engineering", "Sales B2B", "Gestion de patrimoine")
- description : 2-3 phrases "qui ressemble à ça" — métier + 2-3 outils/techno + signaux clés. Sera relue par les passages futurs pour décider du rangement.

${COMMON_RULES}

Réponds en JSON strict :
{
  "new_clusters": [
    { "label": "...", "description": "..." }
  ],
  "assignments": {
    "<candidate_id>": [
      { "label": "doit être dans {nouvelles zones ∪ '${FALLBACK_ZONE_LABEL}'}", "weight": 0.5-1.0 }
    ]
  }
}`
}

const CLOSED_SYSTEM_PROMPT = `Tu es Nora, l'assistante d'un cabinet de recrutement. La taxonomie de zones de ce cabinet est DÉJÀ ÉTABLIE et FERMÉE — tu ne peux PAS créer de nouvelle zone, tu dois assigner chaque candidat à une zone existante OU à "${FALLBACK_ZONE_LABEL}".

Tu reçois :
- la liste des ZONES DISPONIBLES (avec leur description "qui ressemble à ça")
- la liste des candidats à ranger

Ta mission :
1. Pour CHAQUE candidat, analyse l'ensemble (titre + XP + compétences + formation).
2. Choisis la zone qui colle le mieux PARMI LES ZONES DISPONIBLES. Si vraiment rien ne colle, mets-le dans "${FALLBACK_ZONE_LABEL}".
3. Un profil hybride peut être assigné à 2 zones existantes (dominant ≥ 0.7, secondaire 0.5-0.69). Max 3 zones par candidat.
4. Tu ne PEUX PAS proposer de nouvelle zone. new_clusters DOIT être un tableau vide.

${COMMON_RULES}

Réponds en JSON strict :
{
  "new_clusters": [],
  "assignments": {
    "<candidate_id>": [
      { "label": "doit être dans la liste fournie", "weight": 0.5-1.0 }
    ]
  }
}`

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

interface ZoneRow {
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
  // Mutation (déclenche du clustering LLM + écrit des cluster_manifests) :
  // doit être bloquée en lecture seule (essai expiré, suppression
  // programmée, member sans siège) comme toutes les autres routes de
  // mutation du workspace. Remplace l'ancien check getUser()+getCabinetOrgId
  // qui ne vérifiait que l'appartenance à une org, pas l'accès actif.
  const gate = await requireActiveAccess()
  if (!gate.ok) return gate.response
  const orgId = gate.orgId

  const quota = await consumeQuota(getAdminSupabase(), gate.userId, "assistant")
  if (!quota.ok) {
    return NextResponse.json({ error: "quota_exceeded", message: quota.message }, { status: 429 })
  }
  const orgLlm = await consumeOrgLlmActionForUser(getAdminSupabase(), gate.userId)
  if (!orgLlm.ok) {
    return NextResponse.json({ error: orgLlm.code ?? "llm_quota_exceeded", message: orgLlm.message }, { status: 429 })
  }

  // 1) Candidats à clusteriser.
  const { data: candRows, error: fetchErr } = await sb
    .from("candidates")
    .select("*")
    .eq("parse_status", "parsed")
    .not("tags", "cs", "{ancien}")
    .order("created_at", { ascending: false })
  if (fetchErr) {
    console.error("[vivier/cluster] fetch failed:", fetchErr.message)
    return NextResponse.json({ error: "fetch_failed", detail: "internal_error" }, { status: 500 })
  }
  const candidates = (candRows ?? []) as Candidate[]
  if (candidates.length === 0) {
    return NextResponse.json({ error: "empty_vivier", message: "Aucun candidat parsé dans le vivier." }, { status: 400 })
  }
  if (candidates.length > MAX_CANDIDATES_PER_RUN) {
    return NextResponse.json({
      error: "vivier_too_large",
      message: `Le vivier dépasse ${MAX_CANDIDATES_PER_RUN} candidats. Contactez le support pour un traitement asynchrone.`,
    }, { status: 400 })
  }

  const admin = getAdminSupabase()

  // 2) Lit la taxonomie existante.
  const { data: existingZones } = await admin
    .from("cluster_manifests")
    .select("label, description, candidate_count")
    .eq("organization_id", orgId)
  const existing: ZoneRow[] = (existingZones ?? []) as ZoneRow[]

  // 3) S'assure que la zone "Autre" existe toujours.
  if (!existing.some((z) => z.label === FALLBACK_ZONE_LABEL)) {
    await admin.from("cluster_manifests").upsert({
      organization_id: orgId,
      label: FALLBACK_ZONE_LABEL,
      description: FALLBACK_DESCRIPTION,
      candidate_count: 0,
      is_seed: true,
      display_order: 999,
    }, { onConflict: "organization_id,label" })
    existing.push({ label: FALLBACK_ZONE_LABEL, description: FALLBACK_DESCRIPTION, candidate_count: 0 })
  }

  // 4) Détermine le mode : si la taxonomie ne contient QUE "Autre", on est
  //    au premier run (Nora propose). Sinon mode fermé (Nora assigne).
  const realZones = existing.filter((z) => z.label !== FALLBACK_ZONE_LABEL)
  const isFirstRun = realZones.length === 0
  const maxZonesAllowed = isFirstRun
    ? maxZonesForVivierSize(candidates.length)
    : MAX_ZONES_PER_ORG

  // 5) Découpe en batches.
  const allSnapshots = candidates.map(buildSnapshot)
  const batches: CandidateSnapshot[][] = []
  for (let i = 0; i < allSnapshots.length; i += CLUSTER_BATCH_SIZE) {
    batches.push(allSnapshots.slice(i, i + CLUSTER_BATCH_SIZE))
  }

  // 6) État partagé entre batches.
  const allowedLabels = new Map<string, { description: string; isNew: boolean }>()
  for (const z of existing) {
    allowedLabels.set(z.label, { description: z.description, isNew: false })
  }
  const newManifests: Array<{ label: string; description: string }> = []
  const rawAssignments = new Map<string, Array<{ label?: unknown; weight?: unknown }>>()

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i]
    const isFirstBatchOfFirstRun = i === 0 && isFirstRun

    // Le 1er batch d'un 1er run laisse Nora proposer (cap maxZonesAllowed).
    // Tous les autres batches sont en CLOSED — la taxonomie est figée.
    const systemPrompt = isFirstBatchOfFirstRun
      ? firstRunSystemPrompt(maxZonesAllowed)
      : CLOSED_SYSTEM_PROMPT

    const zonesForLlm = Array.from(allowedLabels.entries()).map(([label, info]) => ({
      label,
      description: info.description,
    }))

    const userContent = isFirstBatchOfFirstRun
      ? [
          `Premier passage de clustering. Tu peux proposer jusqu'à ${maxZonesAllowed} zones AU TOTAL.`,
          `Zone système toujours présente : "${FALLBACK_ZONE_LABEL}" — utilise-la pour les candidats sans famille cohérente.`,
          "",
          `CANDIDATS À RANGER (n=${batch.length}) :`,
          JSON.stringify(batch, null, 2),
        ].join("\n")
      : [
          `ZONES DISPONIBLES (taxonomie fermée — tu n'as PAS le droit d'en créer d'autres) :`,
          JSON.stringify(zonesForLlm, null, 2),
          "",
          `CANDIDATS À RANGER (n=${batch.length}) :`,
          JSON.stringify(batch, null, 2),
        ].join("\n")

    let parsed: {
      new_clusters?: Array<{ label?: unknown; description?: unknown }>
      assignments?: Record<string, Array<{ label?: unknown; weight?: unknown }>>
    }
    try {
      const result = await openrouterChat({
        model: "openai/gpt-4o-mini",
        temperature: 0.2,
        maxTokens: 5000,
        timeoutMs: 55_000,
        responseFormat: "json_object",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
      })
      parsed = JSON.parse(result.content) as typeof parsed
    } catch (err) {
      console.error("[cluster] batch failed:", (err as Error).message)
      continue
    }

    // En PREMIER RUN seulement : merge des nouvelles zones, sous cap.
    if (isFirstBatchOfFirstRun) {
      for (const c of parsed.new_clusters ?? []) {
        if (allowedLabels.size >= maxZonesAllowed) break
        const label = typeof c?.label === "string" ? c.label.trim() : ""
        const description = typeof c?.description === "string" ? c.description.trim() : ""
        if (!label || !description) continue
        if (allowedLabels.has(label)) continue
        if (label.toLowerCase() === FALLBACK_ZONE_LABEL.toLowerCase()) continue
        allowedLabels.set(label, { description, isNew: true })
        newManifests.push({ label, description })
      }
    }
    // En CLOSED : on ignore tout new_cluster que le LLM aurait quand même
    // émis (défense en profondeur — le prompt l'interdit déjà).

    // Accumule les assignations.
    for (const [candId, items] of Object.entries(parsed.assignments ?? {})) {
      rawAssignments.set(candId, items)
    }
  }

  // 7) Nettoyage + fallback systématique sur "Autre" si rien de valide.
  const now = new Date().toISOString()
  const updates: Array<{ id: string; assignments: ClusterAssignment[] }> = []
  const labelCounts = new Map<string, number>()
  for (const cand of candidates) {
    const raw = rawAssignments.get(cand.id) ?? []
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
    // Si le LLM n'a rien donné de valide pour ce candidat → "Autre".
    if (clean.length === 0) clean.push({ label: FALLBACK_ZONE_LABEL, weight: 0.5 })
    if (clean.length > 4) clean.length = 4
    clean.sort((a, b) => b.weight - a.weight)
    updates.push({ id: cand.id, assignments: clean })
    for (const a of clean) labelCounts.set(a.label, (labelCounts.get(a.label) ?? 0) + 1)
  }

  // 8) Persiste les assignations.
  const updateResults = await Promise.all(updates.map((u) =>
    admin
      .from("candidates")
      .update({ cluster_assignments: u.assignments, cluster_assigned_at: now })
      .eq("id", u.id)
      .eq("organization_id", orgId),
  ))
  const failed = updateResults.filter((r) => r.error).length

  // 9) Upsert les manifestes pour la prochaine passe (Autre incluse).
  const manifestRowsToUpsert = Array.from(allowedLabels.entries()).map(([label, info]) => ({
    organization_id: orgId,
    label,
    description: info.description,
    candidate_count: labelCounts.get(label) ?? 0,
    // is_seed=true pour les zones créées par le LLM au 1er run + pour Autre.
    // Les zones créées manuellement par le sourceur (POST /api/vivier/zones)
    // sont stampées is_seed=false ; on ne les touche pas ici.
    ...(info.isNew ? { is_seed: true } : {}),
  }))
  if (manifestRowsToUpsert.length > 0) {
    await admin
      .from("cluster_manifests")
      .upsert(manifestRowsToUpsert, { onConflict: "organization_id,label" })
  }

  return NextResponse.json({
    ok: true,
    mode: isFirstRun ? "first_run" : "closed",
    clusters: Array.from(allowedLabels.keys()),
    new_clusters: newManifests.map((m) => m.label),
    classified: updates.length,
    total: candidates.length,
    failed,
    last_run: now,
  })
}
