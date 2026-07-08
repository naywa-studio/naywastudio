/**
 * Classification d'un CV dans des SECTEURS (domaines métier), au parsing.
 *
 * But : ranger le vivier. Précision > exhaustivité — Nora ne pose que les
 * secteurs que le CV DÉMONTRE, réutilise l'existant en priorité, et bascule
 * en "à classer" (to_review) quand elle n'est pas sûre (jamais un mauvais
 * secteur au petit bonheur). Un profil hybride peut avoir plusieurs secteurs.
 *
 * Bornée en temps (best-effort) : si l'appel échoue, on renvoie to_review +
 * aucun secteur → le candidat n'est jamais exclu du matching.
 */

import { openrouterChat, safeJsonParse } from "./openrouter"

export interface SectorClassifyInput {
  current_title?: string | null
  current_company?: string | null
  years_experience?: number | null
  skills?: string[] | null
  summary?: string | null
}

export interface SectorClassifyResult {
  sectors: string[]
  status: "auto" | "to_review"
}

/** Secteur connu de l'org, avec sa définition (réinjectée dans le prompt). */
export interface KnownSector {
  name: string
  description?: string | null
}

const SYSTEM_PROMPT = `Tu es l'assistante de sourcing Naywa. Tu ranges un CV dans des SECTEURS (domaines métier) pour organiser le vivier.

RÈGLES
1. Choisis 1 à 3 secteurs que le CV DÉMONTRE clairement (poste, expérience, formation). PRÉCISION avant tout : uniquement avec preuve. Pas d'exhaustivité.
2. Un profil peut être hybride (2-3 secteurs) — c'est OK — mais reste précis.
3. Réutilise EN PRIORITÉ les secteurs existants fournis (liste ci-dessous). Ne propose un NOUVEAU secteur QUE si aucun existant ne convient vraiment.
4. Un secteur = domaine métier LARGE (ex : "Commercial", "Immobilier", "Data / Cloud", "Finance", "Marketing", "RH", "Santé", "Ingénierie", "Juridique"). JAMAIS un intitulé de poste précis ni une techno isolée.
5. Si le CV est trop pauvre/ambigu pour trancher → sectors: [] et confident: false.

RÉPONDS UNIQUEMENT EN JSON : { "sectors": ["..."], "confident": true|false }`

/** Nettoie / borne une liste de secteurs (trim, dédup casse-insensible, cap 3). */
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
    if (out.length >= 3) break
  }
  return out
}

export async function classifySectors(
  input: SectorClassifyInput,
  existingSectors: KnownSector[],
): Promise<SectorClassifyResult> {
  const payload = {
    poste: input.current_title ?? null,
    entreprise: input.current_company ?? null,
    annees_experience: input.years_experience ?? null,
    competences: (input.skills ?? []).slice(0, 20),
    resume: (input.summary ?? "").slice(0, 800),
  }
  // On fournit les définitions quand elles existent → Nora range CONTRE les
  // définitions du cabinet, pas au feeling (classement cohérent dans le temps).
  const existing = existingSectors.length > 0
    ? existingSectors
        .map((s) => s.description?.trim() ? `- ${s.name} : ${s.description.trim()}` : `- ${s.name}`)
        .join("\n")
    : "(aucun secteur existant — tu peux en créer)"

  try {
    const res = await openrouterChat({
      model: "openai/gpt-4o-mini",
      temperature: 0,
      responseFormat: "json_object",
      maxTokens: 200,
      timeoutMs: 10_000,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `SECTEURS EXISTANTS : ${existing}\n\nCV :\n${JSON.stringify(payload, null, 2)}` },
      ],
    })
    const parsed = safeJsonParse<{ sectors?: unknown; confident?: unknown }>(res.content)
    const sectors = normalizeSectors(parsed?.sectors)
    const confident = parsed?.confident === true && sectors.length > 0
    return { sectors, status: confident ? "auto" : "to_review" }
  } catch {
    // Best-effort : à classer, aucun secteur → jamais exclu du matching.
    return { sectors: [], status: "to_review" }
  }
}
