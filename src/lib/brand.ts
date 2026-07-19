/**
 * Charte graphique Naywa — « Brand System v2.0 · Édition Juillet 2026 ».
 * Source unique des tokens VITRINE (pages publiques). Copie fidèle du handoff
 * Claude Design (`naywa.tokens.ts`).
 *
 * Volontairement séparé de `lib/ui-tokens.ts` (tokens de l'app connectée) : la
 * charte v2.0 s'applique d'abord à la vitrine (papier sable + serif éditorial).
 * L'app garde son thème clair actuel tant que la phase 2 n'est pas lancée — on
 * ne veut pas que le fond sable bave dans le workspace dense.
 *
 * Direction : ton éditorial premium. Ratio d'usage Sable 60 · Encre 30 ·
 * Violet 5 · Corail 5. Le corail est un SIGNAL (alerte / accent ponctuel),
 * jamais décoratif.
 */

export const brand = {
  // ── Violet (signature) ──────────────────────────────────────────────
  violet: '#7B63C8',
  violetDeep: '#4B3A8F',
  violetSoft: '#B8AEDE',
  violet100: '#EEE9FB',
  prune900: '#2E2A5A',

  // ── Encre / neutres papier ──────────────────────────────────────────
  ink: '#1A1B2E',
  slate: '#4B4C5E', // Ardoise
  stone: '#6B6C7F', // Pierre
  lin: '#E9E1CB', // bordure sur papier
  craie: '#FAF7F0', // surface claire
  sable: '#F5F1E8', // fond principal
  white: '#FFFFFF',

  // ── Signal ──────────────────────────────────────────────────────────
  coral: '#E96A5A',

  // ── Texte ───────────────────────────────────────────────────────────
  text: '#1A1B2E',
  textSecondary: '#4B4C5E',
  textMuted: '#6B6C7F',

  // ── Surfaces ────────────────────────────────────────────────────────
  /**
   * Fond de page = blanc chaud quasi imperceptible. Se lit comme blanc (aucun
   * choc en arrivant d'un écran blanc), garde juste un souffle de chaleur. La
   * chaleur « papier » (sable/craie) est dosée en ACCENT — cartes et bandes —
   * pas étalée sur tout le canvas.
   */
  paper: '#FDFCF9',
  /** Sable = bande d'accent chaude (section ponctuelle), plus le fond global. */
  bg: '#F5F1E8',
  /** Craie = surface de carte (chaleur qui ressort sur le fond blanc chaud). */
  surface: '#FAF7F0',
  surface2: '#FFFFFF',
  border: '#E9E1CB',

  // ── États sémantiques ───────────────────────────────────────────────
  success: '#2F6B33',
  successBg: '#E4EFE1',
  warning: '#8A6216',
  warningBg: '#F5E7C4',
  danger: '#C24A3E',
  dangerBg: '#F6DDD8',

  // ── Typo (variables CSS déclarées dans layout via next/font) ─────────
  fontDisplay: "var(--font-fraunces), ui-serif, Georgia, serif",
  fontBody: "var(--font-inter), ui-sans-serif, system-ui, sans-serif",
  fontMono: "var(--font-jetbrains-mono), ui-monospace, monospace",
  /** Italique romantique pour un mot d'accent (« décidez »). */
  fontSerifAccent: "var(--font-instrument-serif), ui-serif, Georgia, serif",

  // ── Rayons ──────────────────────────────────────────────────────────
  radiusSm: 8,
  radiusMd: 12,
  radiusLg: 16,
  radiusXl: 20,
  radiusPill: 999,

  // ── Élévation ───────────────────────────────────────────────────────
  shadowSm: '0 1px 2px rgba(26,27,46,.06)',
  shadowMd: '0 4px 14px rgba(26,27,46,.06)',
  shadowLg: '0 12px 34px rgba(26,27,46,.10)',
  /** Ombre « violette » pour les surfaces mises en avant (CTA, carte popular). */
  shadowViolet: '0 24px 48px -20px rgba(123,99,200,.30)',
} as const

/** Dégradé de marque (accent titre / N du logo). */
export const brandGradient = `linear-gradient(120deg, ${brand.violet} 0%, ${brand.violetSoft} 100%)`

/**
 * Échelle typographique de la charte (§06 « Hiérarchie »). Presets prêts à
 * étaler dans un `style={{}}`. Les grands niveaux sont en clamp responsive.
 *
 *   Display  Fraunces 96 / 0.92 / -0.035em / 500
 *   H1       Fraunces 56 / 1.02 / -0.025em / 500
 *   H2       Fraunces 36 / 1.15 / -0.02em  / 500
 *   H3       Inter    22 / 1.3  / -0.015em / 600
 *   Lead     Inter    18 / 1.6  / 400
 *   Body     Inter    15 / 1.65 / 400
 *   Caption  Inter    13 / 1.5  / 500
 *   Meta     JetBrains Mono 11 / 0.14em uppercase / 500
 */
export const type = {
  display: {
    fontFamily: brand.fontDisplay,
    fontWeight: 500,
    fontSize: 'clamp(44px, 6vw, 88px)',
    lineHeight: 0.98,
    letterSpacing: '-0.03em',
    color: brand.ink,
  },
  h1: {
    fontFamily: brand.fontDisplay,
    fontWeight: 500,
    fontSize: 'clamp(34px, 5vw, 56px)',
    lineHeight: 1.02,
    letterSpacing: '-0.025em',
    color: brand.ink,
  },
  h2: {
    fontFamily: brand.fontDisplay,
    fontWeight: 500,
    fontSize: 'clamp(28px, 3.8vw, 40px)',
    lineHeight: 1.12,
    letterSpacing: '-0.02em',
    color: brand.ink,
  },
  h3: {
    fontFamily: brand.fontBody,
    fontWeight: 600,
    fontSize: 22,
    lineHeight: 1.3,
    letterSpacing: '-0.015em',
    color: brand.ink,
  },
  lead: {
    fontFamily: brand.fontBody,
    fontWeight: 400,
    fontSize: 18,
    lineHeight: 1.6,
    color: brand.textSecondary,
  },
  body: {
    fontFamily: brand.fontBody,
    fontWeight: 400,
    fontSize: 15,
    lineHeight: 1.65,
    color: brand.textSecondary,
  },
  caption: {
    fontFamily: brand.fontBody,
    fontWeight: 500,
    fontSize: 13,
    lineHeight: 1.5,
    color: brand.textMuted,
  },
  /** Eyebrow / label technique. Se combine avec un préfixe « § NN ». */
  meta: {
    fontFamily: brand.fontMono,
    fontWeight: 500,
    fontSize: 11,
    letterSpacing: '0.14em',
    textTransform: 'uppercase' as const,
    color: brand.textMuted,
  },
} as const

/** Accent italique (Instrument Serif) pour un mot dans un titre. */
export const accentItalic = {
  fontFamily: brand.fontSerifAccent,
  fontStyle: 'italic' as const,
  fontWeight: 400,
  color: brand.violet,
}
