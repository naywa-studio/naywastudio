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
 *  - "bento"      : grille de cards modernes (skills + méta + parcours
 *                   en cards distinctes). Plus design, vise un client
 *                   sensible au visuel.
 */
export type AnonymizeTemplate = "classic" | "two-column" | "executive" | "bento"

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
 *
 * La langue est figée en FR : un toggle FR/EN avait été ajouté en
 * V2 mais s'est révélé peu pertinent pour le marché cible (clients
 * français) et bruyant dans l'UI. Le code lib/anonymized-cv conserve
 * la plomberie language en interne avec un défaut "fr".
 */
export interface AnonymizeOptions {
  template: AnonymizeTemplate
  keepNoraSummary: boolean
  customText: string
  watermark: boolean
  /** Texte du filigrane. Vide → le rendu retombe sur le nom de l'org. */
  watermarkText: string
}

export const INITIAL_ANONYMIZE_OPTIONS: AnonymizeOptions = {
  template: "classic",
  // Demande produit (lot Shortlist) : le résumé Nora est MASQUÉ par défaut.
  // Le sourceur le coche explicitement mission par mission.
  keepNoraSummary: false,
  customText: "",
  watermark: false,
  watermarkText: "",
}

/* ── Persistance en 2 niveaux (migration 067) ─────────────────────────────
 *
 *  - Org (Branding) : le GABARIT du cabinet = template + filigrane. Réglé une
 *    fois, appliqué à tous les CV anonymisés → paquet homogène (lot C).
 *  - Mission (Shortlist) : le CONTENU éditorial = résumé Nora + message.
 *    Ajusté par mission avant génération.
 * ─────────────────────────────────────────────────────────────────────── */

/** Défauts d'anonymisation du cabinet (organizations.anonymize_defaults). */
export interface OrgAnonymizeDefaults {
  template: AnonymizeTemplate
  /** Filigrane activé ? Décoché par défaut. */
  watermark: boolean
  /** Texte du filigrane. Vide → nom de l'org au rendu. */
  watermarkText: string
}

export const INITIAL_ORG_ANONYMIZE_DEFAULTS: OrgAnonymizeDefaults = {
  template: "classic",
  watermark: false,
  watermarkText: "",
}

/** Override d'anonymisation par mission (jobs.anonymize_options). */
export interface JobAnonymizeOptions {
  keepNoraSummary: boolean
  customText: string
}

export const INITIAL_JOB_ANONYMIZE_OPTIONS: JobAnonymizeOptions = {
  keepNoraSummary: false,
  customText: "",
}

/** Normalise un template inconnu vers un template valide (défaut "classic"). */
export function coerceTemplate(v: unknown): AnonymizeTemplate {
  return v === "two-column" || v === "executive" || v === "bento" ? v : "classic"
}

/** Lit les défauts cabinet depuis le jsonb brut (tolère NULL / champs manquants). */
export function readOrgDefaults(raw: unknown): OrgAnonymizeDefaults {
  const o = (raw ?? {}) as Record<string, unknown>
  return {
    template: coerceTemplate(o.template),
    watermark: typeof o.watermark === "boolean" ? o.watermark : false,
    watermarkText: typeof o.watermarkText === "string" ? o.watermarkText.slice(0, 40) : "",
  }
}

/** Lit les options mission depuis le jsonb brut (tolère NULL / champs manquants). */
export function readJobOptions(raw: unknown): JobAnonymizeOptions {
  const o = (raw ?? {}) as Record<string, unknown>
  return {
    keepNoraSummary: typeof o.keepNoraSummary === "boolean" ? o.keepNoraSummary : false,
    customText: typeof o.customText === "string" ? o.customText.slice(0, CUSTOM_TEXT_MAX) : "",
  }
}

/** Fusionne défauts cabinet + options mission → options effectives de rendu. */
export function resolveAnonymizeOptions(
  org: OrgAnonymizeDefaults,
  job: JobAnonymizeOptions,
): AnonymizeOptions {
  return {
    template: org.template,
    watermark: org.watermark,
    watermarkText: org.watermarkText,
    keepNoraSummary: job.keepNoraSummary,
    customText: job.customText,
  }
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
  "bento": {
    label: "Bento",
    hint: "Grille de cards modernes. Vise un client sensible au visuel.",
  },
}

/** UI selector only (labels/hints for the "Personnaliser" panel) — the
 *  generated PDF content stays French by design regardless of language. */
export const TEMPLATE_META_EN: Record<AnonymizeTemplate, { label: string; hint: string }> = {
  "classic": {
    label: "Classic",
    hint: "Sober, single-column, linear layout.",
  },
  "two-column": {
    label: "Compact 2-column",
    hint: "Skills sidebar + experience on the main side.",
  },
  "executive": {
    label: "Executive",
    hint: "Airy, big headline, few chips. Senior profiles.",
  },
  "bento": {
    label: "Bento",
    hint: "Modern card grid. For visually-minded clients.",
  },
}

export const CUSTOM_TEXT_MAX = 600
