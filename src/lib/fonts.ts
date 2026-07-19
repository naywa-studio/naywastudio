import { Space_Grotesk, Inter, Instrument_Serif, Fraunces, JetBrains_Mono } from 'next/font/google'

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
  weight: ['400', '500', '600', '700'],
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

export const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: ['400'],
  style: ['normal', 'italic'],
  variable: '--font-instrument-serif',
  display: 'swap',
})
