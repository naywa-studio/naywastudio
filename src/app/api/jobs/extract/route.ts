/**
 * POST /api/jobs/extract  { brief }
 *
 * Le sourceur donne son brief, sa fiche de poste ou un appel d'offre. Nora
 * extrait les champs structurés. Le sourceur complète les manquants, peut
 * éditer, puis valide.
 *
 * Aucune création de mission ici — c'est juste de l'extraction. La création
 * finale se fait via POST /api/jobs avec le payload final.
 */

import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { getAdminSupabase } from "@/lib/admin-supabase"
import { consumeQuota, consumeOrgLlmActionForUser } from "@/lib/quota"
import { openrouterChat } from "@/lib/openrouter"

export const runtime = "nodejs"
// Vercel Hobby plan capère à 10s en pratique : on cap maxDuration à 9s
// pour être sûr de répondre avec un JSON propre (502) plutôt qu'une
// réponse vide qui ferait crash le client avec "Unexpected end of JSON".
// Si on migre Pro un jour, on peut remonter à 30s.
export const maxDuration = 9

const MAX_BRIEF_CHARS = 12_000

const SYSTEM_PROMPT = `Tu es Nora, l'assistante d'un cabinet de recrutement. Le sourceur te donne un brief texte (peut être : description rapide, fiche de poste structurée, appel d'offre client). Tu extrais les champs structurés. Si une info manque, tu mets null — N'INVENTE RIEN.

Schéma JSON strict :
{
  "role_name":            string | null,
  "seniority_min_years":  number | null,
  "seniority_max_years":  number | null,
  "contract_type":        "cdi" | "cdd" | "freelance" | "portage" | "alternance" | null,
  "location":             string | null,
  "pricing_lieu":         "paris_petite_couronne" | "idf_grande_couronne" | "lyon" | "province" | null,
  "required_skills":      string[],
  "nice_to_have_skills":  string[],
  "duration_months":      number | null,
  "start_date":           string | null,
  "client_tjm_min":       number | null,
  "client_tjm_max":       number | null,
  "target_gross_salary":  number | null,
  "description":          string | null
}

Règles d'extraction :

- "role_name" : le NOM DU POSTE recherché (ex : "Data Engineer", "Product Manager", "Développeur Backend Java"). PAS l'intitulé de mission (ex : "Mission DataLake BNP" → role_name = "Data Engineer"). Si vraiment indéterminable → null.

- "seniority_min_years" / "seniority_max_years" : intervalle en années d'XP attendu. Si le brief dit "junior" → 0-3, "confirmé" → 3-6, "senior" → 6-10, "lead" → 10+. Si "minimum 5 ans" → min=5, max=null. Si rien d'explicite → tous deux null.

- "contract_type" : type de contrat. CDI / CDD / freelance (incluant "indépendant", "portage" est distinct) / portage / alternance. Si non précisé → null.

- "location" : lieu de la mission tel qu'écrit (texte libre). "Paris", "Lyon", "Remote", "Hybride Paris 2j/sem", etc. null si pas mentionné.

- "pricing_lieu" : version typée du lieu, pour le calcul URSSAF/transport. Mappe :
  - Paris intra-muros + 92/93/94 → "paris_petite_couronne"
  - Reste Île-de-France (77, 78, 91, 95) → "idf_grande_couronne"
  - Lyon → "lyon"
  - Toute autre ville de province (Bordeaux, Marseille, Nantes…) → "province"
  - Remote total ou indéterminable → null

- "required_skills" : compétences techniques / méthodologiques / outils EXPLICITEMENT requis. Si le brief dit "indispensable Python, SQL, Spark" → ["Python", "SQL", "Spark"]. Max 15.

- "nice_to_have_skills" : compétences mentionnées comme un plus, optionnelles, "serait apprécié". Distinctes des required. Max 10.

- "duration_months" : durée mission en mois (entier). Si "1 an" → 12, "6 mois" → 6, "3 à 6 mois" → 6 (prends le plus court réaliste pour le pricing… non en fait prends le plus haut, c'est ce que le client attend max). Si CDI sans précision → null. Si non précisé → null.

- "start_date" : date de démarrage en ISO 8601 (YYYY-MM-DD). "Démarrage immédiat" → la date d'aujourd'hui n'est pas idéale, mets null pour laisser le sourceur compléter. "Septembre 2026" → "2026-09-01". null si non précisé.

- "client_tjm_min" / "client_tjm_max" : intervalle TJM client en euros HT. Si "500-550€/j" → 500 et 550. Si "max 600" → null et 600. null sinon.

- "target_gross_salary" : si le brief mentionne un brut annuel cible (ex : "45-50k€ brut/an") → mets la valeur haute. null sinon.

- "description" : RÉSUMÉ propre de 2-4 phrases pour la fiche mission. Doit couvrir : contexte client + objectif + stack/outils clés + différenciant. null si le brief est trop pauvre.

Réponds en JSON pur, sans texte autour, sans markdown.`

export async function POST(req: NextRequest) {
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })

  const body = await req.json().catch(() => null) as { brief?: unknown } | null
  const brief = typeof body?.brief === "string" ? body.brief.trim() : ""
  if (!brief) {
    return NextResponse.json({ error: "empty_brief", message: "Le brief est vide." }, { status: 400 })
  }
  if (brief.length > MAX_BRIEF_CHARS) {
    return NextResponse.json({ error: "brief_too_long", message: `Le brief dépasse ${MAX_BRIEF_CHARS} caractères.` }, { status: 400 })
  }

  const quota = await consumeQuota(getAdminSupabase(), user.id, "match")
  if (!quota.ok) {
    return NextResponse.json({ error: "quota_exceeded", message: quota.message }, { status: 429 })
  }
  const orgLlm = await consumeOrgLlmActionForUser(getAdminSupabase(), user.id)
  if (!orgLlm.ok) {
    return NextResponse.json({ error: orgLlm.code ?? "llm_quota_exceeded", message: orgLlm.message }, { status: 429 })
  }

  let parsed: Record<string, unknown>
  try {
    const result = await openrouterChat({
      model: "openai/gpt-4o-mini",
      temperature: 0.1,
      maxTokens: 1500,
      timeoutMs: 25_000,
      responseFormat: "json_object",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Voici le brief à analyser :\n\n${brief}` },
      ],
    })
    parsed = JSON.parse(result.content) as Record<string, unknown>
  } catch (err) {
    return NextResponse.json(
      { error: "llm_failed", detail: (err as Error).message },
      { status: 502 },
    )
  }

  // Sanitize + return canonical shape.
  const str = (v: unknown): string | null => {
    if (typeof v !== "string") return null
    const t = v.trim()
    return t.length ? t : null
  }
  const num = (v: unknown): number | null => {
    if (v === null || v === undefined) return null
    const n = typeof v === "number" ? v : Number(v)
    return Number.isFinite(n) ? n : null
  }
  const arr = (v: unknown, cap: number): string[] => {
    if (!Array.isArray(v)) return []
    const seen = new Set<string>()
    const out: string[] = []
    for (const x of v) {
      const s = String(x).trim()
      if (!s) continue
      const k = s.toLowerCase()
      if (seen.has(k)) continue
      seen.add(k); out.push(s)
      if (out.length >= cap) break
    }
    return out
  }
  const enumOf = <T extends string>(v: unknown, allowed: T[]): T | null => {
    const s = str(v)?.toLowerCase()
    return s && (allowed as string[]).includes(s) ? s as T : null
  }

  return NextResponse.json({
    ok: true,
    extracted: {
      role_name: str(parsed.role_name),
      seniority_min_years: num(parsed.seniority_min_years),
      seniority_max_years: num(parsed.seniority_max_years),
      contract_type: enumOf(parsed.contract_type, ["cdi", "cdd", "freelance", "portage", "alternance"]),
      location: str(parsed.location),
      pricing_lieu: enumOf(parsed.pricing_lieu, ["paris_petite_couronne", "idf_grande_couronne", "lyon", "province"]),
      required_skills: arr(parsed.required_skills, 15),
      nice_to_have_skills: arr(parsed.nice_to_have_skills, 10),
      duration_months: num(parsed.duration_months),
      start_date: str(parsed.start_date),
      client_tjm_min: num(parsed.client_tjm_min),
      client_tjm_max: num(parsed.client_tjm_max),
      target_gross_salary: num(parsed.target_gross_salary),
      description: str(parsed.description),
    },
  })
}
