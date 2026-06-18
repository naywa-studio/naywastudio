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
 * Identifiants des templates de PDF anonymisé disponibles. Chaque
 * template a un layout propre (mono-colonne, deux colonnes, etc.)
 * mais partage la base : header brand, footer contact, watermark,
 * labels FR/EN.
 *
 *  - "classic"    : mono-colonne sobre, le défaut historique
 *  - "two-column" : sidebar gauche (skills, méta) + main droite
 *                   (résumé, parcours, formation). Idéal profils tech.
 *  - "executive"  : mono-colonne aérée, gros titre, peu de chips,
 *                   skills triées sur le volet. Pour profils senior /
 *                   C-level présentés à des décideurs métier.
 */
export type AnonymizeTemplate = "classic" | "two-column" | "executive"

/**
 * Options de personnalisation choisies par le sourceur sur la fiche
 * match avant génération. Transmises au POST /api/cv/[id]/anonymize
 * qui les passe à @react-pdf pour le rendu final.
 *
 *  - template : layout du PDF (cf. AnonymizeTemplate)
 *  - keepNoraSummary : afficher (true) ou masquer (false) le résumé
 *    factuel généré par Nora. Toggle ON par défaut.
 *  - customText : message libre rédigé par le sourceur. Si non vide,
 *    il s'affiche en plus du résumé Nora (ou seul si keepNoraSummary
 *    est false). Limité à 600 caractères côté UI.
 *  - watermark : filigrane diagonal "<NomCabinet>" en fond de toutes
 *    les pages. Anti-screenshot soft. OFF par défaut.
 *  - language : langue des labels du PDF ("fr" | "en"). Le contenu
 *    du CV (parcours, formation) reste dans sa langue d'origine ;
 *    seuls les libellés section + métadonnées + résumé Nora sont
 *    générés/traduits dans la langue choisie. FR par défaut.
 */
export interface AnonymizeOptions {
  template: AnonymizeTemplate
  keepNoraSummary: boolean
  customText: string
  watermark: boolean
  language: "fr" | "en"
}

export const INITIAL_ANONYMIZE_OPTIONS: AnonymizeOptions = {
  template: "classic",
  keepNoraSummary: true,
  customText: "",
  watermark: false,
  language: "fr",
}

/**
 * Métadonnées de présentation des templates dans le panneau
 * "Personnaliser". Label + hint apparaissent dans le sélecteur UI.
 */
export const TEMPLATE_META: Record<AnonymizeTemplate, { label: string; hint: string }> = {
  "classic": {
    label: "Classique",
    hint: "Sobre, mono-colonne, présentation linéaire.",
  },
  "two-column": {
    label: "Compact 2 colonnes",
    hint: "Sidebar compétences + parcours côté main.",
  },
  "executive": {
    label: "Exécutif",
    hint: "Aéré, gros titre, peu de chips. Profils senior.",
  },
}

export const CUSTOM_TEXT_MAX = 600
