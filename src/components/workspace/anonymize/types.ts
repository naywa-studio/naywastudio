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

/**
 * Options de personnalisation choisies par le sourceur sur la fiche
 * match avant génération. Transmises au POST /api/cv/[id]/anonymize
 * qui les passe à @react-pdf pour le rendu final.
 *
 *  - keepNoraSummary : afficher (true) ou masquer (false) le résumé
 *    factuel généré par Nora. Toggle ON par défaut.
 *  - customText : message libre rédigé par le sourceur. Si non vide,
 *    il s'affiche en plus du résumé Nora (ou seul si keepNoraSummary
 *    est false). Limité à 600 caractères côté UI.
 *  - watermark : filigrane diagonal "Réf · NomCabinet" en fond de
 *    toutes les pages. Anti-screenshot soft. OFF par défaut.
 *  - language : langue des labels du PDF ("fr" | "en"). Le contenu
 *    du CV (parcours, formation) reste dans sa langue d'origine ;
 *    seuls les libellés section + métadonnées sont traduits. FR
 *    par défaut.
 */
export interface AnonymizeOptions {
  keepNoraSummary: boolean
  customText: string
  watermark: boolean
  language: "fr" | "en"
}

export const INITIAL_ANONYMIZE_OPTIONS: AnonymizeOptions = {
  keepNoraSummary: true,
  customText: "",
  watermark: false,
  language: "fr",
}

export const CUSTOM_TEXT_MAX = 600
