/**
 * Critères « à proscrire » (Partie B, Option A) — liste libre de points
 * rédhibitoires par mission, injectée dans le prompt de matching pour
 * pénaliser fortement un candidat qui y correspond. Distinct des critères
 * positifs (`jobs.criteria`).
 *
 * Format volontairement simple (text[]) : pas de nouveau type de critère,
 * pas d'impact sur l'affichage des `criteria_eval`.
 */

/** Longueur max d'une exclusion et nombre max d'exclusions par mission. */
export const EXCLUSION_MAX_LEN = 120
export const EXCLUSION_MAX_COUNT = 20

/** Nettoie une liste reçue du client / du LLM : trim, borne, dédoublonne
 *  (insensible à la casse), plafonne la cardinalité. */
export function sanitizeExclusions(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of input) {
    if (typeof raw !== "string") continue
    const v = raw.trim().slice(0, EXCLUSION_MAX_LEN)
    if (!v) continue
    const key = v.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(v)
    if (out.length >= EXCLUSION_MAX_COUNT) break
  }
  return out
}
