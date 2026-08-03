import { Space_Grotesk, Inter, Fraunces, JetBrains_Mono } from 'next/font/google'

export const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-space-grotesk',
  display: 'swap',
})

/**
 * Charte v2.0 — serif éditorial haut-contraste (titres, chiffres, citations).
 * Variable, optical sizing activé pour un rendu fin aux grandes tailles.
 */
export const fraunces = Fraunces({
  subsets: ['latin'],
  // Variable (pas de weights figés) + axe optique `opsz` : comme la charte,
  // qui charge Fraunces variable. Avec `font-optical-sizing: auto` (défaut
  // navigateur), les traits s'AFFINENT aux grandes tailles → l'élégance
  // haut-contraste des titres et de l'accent italique. Sans ça, Fraunces
  // reste « épais » à toute taille (rendu pataud). `SOFT` dispo pour adoucir
  // les terminaisons si besoin. La wght reste variable (font-weight marche).
  axes: ['opsz', 'SOFT'],
  style: ['normal', 'italic'],
  variable: '--font-fraunces',
  display: 'swap',
})

/** Charte v2.0 — mono pour labels techniques, tags de section (§ 01), meta. */
export const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
})

export const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '700', '800'],
  variable: '--font-inter',
  display: 'swap',
})
