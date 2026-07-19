/**
 * Tokens visuels sémantiques de l'app connectée (workspace / organisation).
 *
 * ⚠️ Les VALEURS ne vivent plus ici : elles sont déclarées une seule fois en
 * variables CSS `--nw-*` dans `app/globals.css`. Ce fichier n'est qu'une
 * façade typée qui les pointe, pour le confort d'écriture en TS.
 *
 * Pourquoi ce détour : le projet écrit ses styles en objets inline et les
 * couleurs vivaient en hex bruts (~2000 occurrences ; ce fichier n'était
 * importé que par 2 composants). Une variable CSS s'applique de la même façon
 * dans un objet de style, une template string ou un attribut SVG, sans imposer
 * d'import — c'est le seul mécanisme qui pouvait absorber tout l'existant.
 * Résultat : la charte s'ajuste dans globals.css, et nulle part ailleurs.
 *
 * ⚠️ Ne pas utiliser ces tokens dans les rendus PDF (@react-pdf), DOCX ou
 * email : ils ne résolvent pas `var()`. Ces rendus gardent des valeurs
 * littérales.
 *
 * Accessibilité : les paires texte/fond visent AA (≥ 4.5:1 sur blanc).
 * `textMuted` vaut #6B6C7F (~4.7:1) — l'ancien #9CA3AF (~2.5:1) échouait.
 */

export const ui = {
  // ── Surfaces ────────────────────────────────────────────────────────
  /** Fond général de l'app (calme, sans animation sur les pages denses). */
  bg: "var(--nw-bg)",
  /** Surface d'une carte / panneau. */
  surface: "var(--nw-surface)",
  /** Surface secondaire (jauge, ligne critère, champ). */
  surfaceMuted: "var(--nw-surface-muted)",

  // ── Texte ───────────────────────────────────────────────────────────
  /** Titre / valeur forte. */
  text: "var(--nw-text)",
  /** Corps de texte. */
  textBody: "var(--nw-text-body)",
  /** Corps de texte secondaire (labels, descriptions). AA sur blanc. */
  textSecondary: "var(--nw-text-secondary)",
  /** Texte tertiaire discret (méta, aides). AA sur blanc. */
  textMuted: "var(--nw-text-muted)",

  // ── Marque ──────────────────────────────────────────────────────────
  primary: "var(--nw-primary)",
  primaryDark: "var(--nw-primary-dark)",
  secondary: "var(--nw-primary-200)",
  /** Voile violet léger (fonds de pastille, hover). */
  primarySoft: "rgba(124,99,200,0.08)",
  primarySoftBorder: "rgba(124,99,200,0.22)",
  /** Dégradé CTA primaire. */
  primaryGradient:
    "linear-gradient(120deg, var(--nw-primary) 0%, var(--nw-primary-dark) 100%)",

  // ── Bordures ────────────────────────────────────────────────────────
  border: "var(--nw-border)",
  /** Bordure douce teintée (cartes de l'app). */
  borderSoft: "var(--nw-border-soft)",
  borderBrand: "rgba(124,99,200,0.30)",

  // ── États sémantiques (texte + fond + bordure) ──────────────────────
  success: "var(--nw-success)",
  successBg: "rgba(34,197,94,0.12)",
  successBorder: "rgba(34,197,94,0.30)",
  warn: "var(--nw-warn)",
  warnBg: "rgba(245,158,11,0.10)",
  warnBorder: "rgba(245,158,11,0.25)",
  danger: "var(--nw-danger-strong)",
  dangerBg: "rgba(239,68,68,0.08)",
  dangerBorder: "rgba(239,68,68,0.22)",

  // ── Typo ────────────────────────────────────────────────────────────
  /** Inter partout dans l'app : écrans denses, lisibilité avant caractère. */
  fontBody: "var(--font-inter), ui-sans-serif, system-ui, sans-serif",
  /** Mono réservé aux libellés, références et valeurs chiffrées. */
  fontMono: "var(--nw-font-mono)",

  // ── Rayons ──────────────────────────────────────────────────────────
  radiusSm: 8,
  radiusMd: 12,
  radiusLg: 16,
  radiusXl: 20,
  radiusPill: 999,

  // ── Élévation (échelle cohérente, pas de valeurs random) ────────────
  shadowSm: "0 1px 2px rgba(17,24,39,0.05)",
  shadowMd: "0 4px 14px rgba(124,99,200,0.08)",
  shadowLg: "0 12px 34px rgba(124,99,200,0.14)",
} as const

/**
 * Échelle d'espacement 4/8 (spacing-scale). À utiliser pour padding / gap /
 * margin afin de garder un rythme régulier au lieu de 7/10/13/14 ad hoc.
 */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const
