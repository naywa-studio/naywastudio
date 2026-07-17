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
  bg: '#F5F1E8',
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
