/**
 * Logique de taxonomie de zones pour le clustering vivier.
 *
 * Principe (Sprint B) :
 *   - Le 1er run de clustering laisse Nora PROPOSER N zones initiales
 *     (cap dynamique selon la taille du vivier — cf. maxZonesForVivierSize).
 *   - Les runs suivants : Nora choisit uniquement dans la taxonomie
 *     existante (cluster_manifests). Si rien ne colle vraiment → zone
 *     système "Autre" (toujours présente, jamais supprimable).
 *   - Le sourceur peut créer/éditer/supprimer ses zones via le panneau
 *     "Mes zones" sur /workspace/vivier.
 */

/** Label réservé : zone fallback toujours présente, non supprimable. */
export const FALLBACK_ZONE_LABEL = "Autre"

/** Cap absolu de zones par org. Au-delà l'UX devient illisible. */
export const MAX_ZONES_PER_ORG = 20

/**
 * Cap dynamique au PREMIER run de clustering : on évite que Nora crée
 * 10 zones pour 10 candidats. Règle :
 *   - 1-9 candidats : 1 seule zone (= Autre). Pas la peine de clusteriser.
 *   - 10-19 candidats : 2 zones max
 *   - 20-39 candidats : 4 zones max
 *   - 40-79 candidats : 7 zones max
 *   - 80-149 candidats : 10 zones max
 *   - 150+ candidats : 15 zones max (toujours sous MAX_ZONES_PER_ORG = 20)
 *
 * Heuristique : au moins ~10 candidats par zone en moyenne pour qu'une
 * zone soit "lisible" et utile. En-dessous c'est de la dispersion.
 */
export function maxZonesForVivierSize(candidateCount: number): number {
  if (candidateCount < 10) return 1
  if (candidateCount < 20) return 2
  if (candidateCount < 40) return 4
  if (candidateCount < 80) return 7
  if (candidateCount < 150) return 10
  return 15
}

/** Min candidats par zone pour qu'elle soit légitime (sinon → Autre). */
export const MIN_CANDIDATES_PER_ZONE = 3

/**
 * Sanitize un label de zone saisi par l'utilisateur. Renvoie null si
 * invalide.
 */
export function sanitizeZoneLabel(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const trimmed = raw.trim().replace(/\s+/g, " ")
  if (trimmed.length < 2) return null
  if (trimmed.length > 60) return null
  return trimmed
}

/**
 * Sanitize une description de zone saisie par l'utilisateur.
 * 280 caractères max (équivalent d'un tweet — assez pour donner les
 * signaux clés sans devenir une dissertation).
 */
export function sanitizeZoneDescription(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const trimmed = raw.trim().replace(/\s+/g, " ")
  if (trimmed.length < 10) return null
  if (trimmed.length > 280) return null
  return trimmed
}
