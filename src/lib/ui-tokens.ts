/**
 * Tokens visuels sémantiques de l'app connectée (workspace / organisation).
 *
 * But : arrêter la dérive des hex bruts répétés inline dans chaque composant
 * (couleurs de texte, surfaces, bordures, états). Un seul endroit à toucher
 * pour ajuster la charte, et des noms qui disent l'INTENTION (textMuted vs
 * "#9CA3AF") plutôt qu'une valeur opaque.
 *
 * Contrainte projet : pas de Tailwind, styles inline React.CSSProperties.
 * On expose donc un objet TS simple, importé là où on met en forme.
 *
 * Accessibilité : les paires texte/fond visent AA (≥ 4.5:1 sur blanc).
 *   - textMuted #6B7280 ≈ 4.6:1 (l'ancien #9CA3AF ≈ 2.5:1 échouait AA).
 */

export const ui = {
  // ── Surfaces ────────────────────────────────────────────────────────
  /** Fond général de l'app (calme, sans animation sur les pages denses). */
  bg: "#F8F6FF",
  /** Surface d'une carte / panneau. */
  surface: "#FFFFFF",
  /** Surface secondaire (jauge, ligne critère, champ). */
  surfaceMuted: "#FAFAFB",

  // ── Texte ───────────────────────────────────────────────────────────
  /** Titre / valeur forte. */
  text: "#111827",
  /** Corps de texte secondaire (labels, descriptions). AA sur blanc. */
  textSecondary: "#4B5563",
  /** Texte tertiaire discret (méta, aides). AA sur blanc (~4.6:1). */
  textMuted: "#6B7280",

  // ── Marque ──────────────────────────────────────────────────────────
  primary: "#7C63C8",
  primaryDark: "#6B54B2",
  secondary: "#B8AEDE",
  /** Voile violet léger (fonds de pastille, hover). */
  primarySoft: "rgba(124,99,200,0.08)",
  primarySoftBorder: "rgba(124,99,200,0.22)",
  /** Dégradé CTA primaire. */
  primaryGradient: "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)",

  // ── Bordures ────────────────────────────────────────────────────────
  border: "#E5E7EB",
  /** Bordure douce teintée (cartes de l'app). */
  borderSoft: "#F0ECF8",
  borderBrand: "rgba(124,99,200,0.30)",

  // ── États sémantiques (texte + fond + bordure) ──────────────────────
  success: "#15803D",
  successBg: "rgba(34,197,94,0.12)",
  successBorder: "rgba(34,197,94,0.30)",
  warn: "#B45309",
  warnBg: "rgba(245,158,11,0.10)",
  warnBorder: "rgba(245,158,11,0.25)",
  danger: "#B91C1C",
  dangerBg: "rgba(239,68,68,0.08)",
  dangerBorder: "rgba(239,68,68,0.22)",

  // ── Rayons ──────────────────────────────────────────────────────────
  radiusSm: 8,
  radiusMd: 12,
  radiusLg: 16,
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
