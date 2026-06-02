/**
 * candidateRef — réf courte stable d'un candidat (8 premiers caractères de
 * l'UUID, en majuscule, sans tirets).
 *
 * Mêmes valeurs que `refFor` côté route /api/cv/[id]/anonymize qui s'en sert
 * pour le PDF anonymisé. Centralisé ici pour que la même valeur soit affichée
 * partout (fiche match, fiche vivier, dashboard pricing, recherche vivier).
 *
 * Format affiché : "C-XXXXXXXX" pour qu'on le reconnaisse comme une réf
 * candidat (préfixe C-).
 */

export function candidateRefSlug(id: string): string {
  return id.replace(/-/g, "").slice(0, 8).toUpperCase()
}

export function candidateRefLabel(id: string): string {
  return `C-${candidateRefSlug(id)}`
}

/** Pour la recherche : retourne true si la chaîne tapée matche la ref.
 *  Accepte "C-1A2B3C4D", "c1a2b3c4d", "1A2B3C4D" — tolère les espaces et tirets. */
export function matchesCandidateRef(id: string, query: string): boolean {
  const slug = candidateRefSlug(id)
  const cleaned = query.toUpperCase().replace(/[\s-]+/g, "").replace(/^C/, "")
  if (cleaned.length === 0) return false
  return slug.startsWith(cleaned)
}
