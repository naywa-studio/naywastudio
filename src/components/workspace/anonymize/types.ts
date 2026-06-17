/**
 * Types partagés entre AnonymizeControls (haut de page fiche match) et
 * AnonymizePreview (bas de page). L'état est lifté dans le composant
 * parent (MatchPage) pour qu'un seul état pilote les deux slots
 * visuellement séparés.
 *
 * V1 (ce commit) : juste l'état de génération.
 * V2 (commit suivant) : ajout des paramètres "Personnaliser"
 * (keepNoraSummary, customText, watermark, language).
 */

export type AnonymizeState = "idle" | "working" | "ready" | "error"

export interface AnonymizeStatus {
  state: AnonymizeState
  previewUrl: string | null
  downloadUrl: string | null
  error: string | null
}

export const INITIAL_ANONYMIZE_STATUS: AnonymizeStatus = {
  state: "idle",
  previewUrl: null,
  downloadUrl: null,
  error: null,
}
