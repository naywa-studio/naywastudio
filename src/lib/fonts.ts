import { Space_Grotesk, Inter, Fraunces, JetBrains_Mono } from 'next/font/google'

export const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-space-grotesk',
  display: 'swap',
})

/**
 * Charte v2.0 — serif éditorial haut-contraste (titres, chiffres, citations,
 * ET l'italique d'accent d'un mot — l'accent n'est PAS une 4ᵉ police).
 * Chargée en VARIABLE (pas de `weight` figé) pour activer l'axe optique `opsz` :
 * `font-optical-sizing: auto` affine alors les grands titres au lieu de les
 * rendre pataud. Ne jamais repasser sur un tableau `weight` — ça verrouille opsz.
 */
export const fraunces = Fraunces({
  subsets: ['latin'],
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
