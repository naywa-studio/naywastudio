'use client'

import { useEffect, useState } from 'react'
import { brand } from '@/lib/brand'

/**
 * Naywa Studio — Bandes signature (charte v2.0, §03 « Motif de marque »).
 *
 * Géométrie reprise À L'IDENTIQUE du handoff Claude Design : deux rubans FINS
 * (viewBox 900×500, ~60px d'épaisseur) qui traversent en diagonale ascendante,
 * bas-gauche → haut-droite. Dégradé horizontal très léger, la majorité de
 * l'écran reste du papier sable. « Lente, presque immobile, on la remarque à
 * peine. » Cadence 11s + 15s.
 *
 * Remplace `ShaderBackground` (WebGL plein écran qui redessinait en continu +
 * recalculait à chaque scroll → saccades sur PC). Ici : pur SVG, animation
 * `d` en SMIL, pas de canvas ni de listener scroll. `prefers-reduced-motion`
 * → rubans figés (état A), sans balise `<animate>`.
 */

// Deux clés d'animation (A ↔ B), reproduites du handoff (bandDrift1/2).
const B1_FILL_A = 'M-40 220 C 240 140, 620 340, 940 200 L 940 260 C 620 400, 240 200, -40 280 Z'
const B1_FILL_B = 'M-40 240 C 240 160, 620 320, 940 180 L 940 240 C 620 380, 240 220, -40 300 Z'
const B2_FILL_A = 'M-40 300 C 240 220, 620 420, 940 280 L 940 340 C 620 480, 240 280, -40 360 Z'
const B2_FILL_B = 'M-40 320 C 240 240, 620 400, 940 260 L 940 320 C 620 460, 240 300, -40 380 Z'
const B1_LINE_A = 'M-40 220 C 240 140, 620 340, 940 200'
const B1_LINE_B = 'M-40 240 C 240 160, 620 320, 940 180'
const B2_LINE_A = 'M-40 300 C 240 220, 620 420, 940 280'
const B2_LINE_B = 'M-40 320 C 240 240, 620 400, 940 260'

const KTIMES = '0;0.5;1'
const SPLINE = '0.45 0 0.55 1;0.45 0 0.55 1'

/** valeurs SMIL « A;B;A » (aller-retour fluide). */
const cycle = (a: string, b: string) => `${a};${b};${a}`

function Band({
  a,
  b,
  dur,
  animate,
  ...rest
}: {
  a: string
  b: string
  dur: string
  animate: boolean
} & React.SVGProps<SVGPathElement>) {
  return (
    <path d={a} {...rest}>
      {animate && (
        <animate
          attributeName="d"
          dur={dur}
          repeatCount="indefinite"
          calcMode="spline"
          keyTimes={KTIMES}
          keySplines={SPLINE}
          values={cycle(a, b)}
        />
      )}
    </path>
  )
}

export function BrandBands() {
  // 1er paint identique serveur/client (animate = true), puis on coupe si
  // l'utilisateur préfère la sobriété. Pas de mismatch d'hydratation.
  const [animate, setAnimate] = useState(true)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const apply = () => setAnimate(!mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  return (
    <div
      aria-hidden
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
        background: brand.sable,
      }}
    >
      <svg
        viewBox="0 0 900 500"
        preserveAspectRatio="none"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.9 }}
      >
        <defs>
          <linearGradient id="nawa-band-1" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={brand.violet} stopOpacity="0.20" />
            <stop offset="100%" stopColor={brand.violetSoft} stopOpacity="0.05" />
          </linearGradient>
          <linearGradient id="nawa-band-2" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={brand.violetDeep} stopOpacity="0.15" />
            <stop offset="100%" stopColor={brand.violet} stopOpacity="0.05" />
          </linearGradient>
        </defs>

        <Band a={B1_FILL_A} b={B1_FILL_B} dur="11s" animate={animate} fill="url(#nawa-band-1)" />
        <Band a={B2_FILL_A} b={B2_FILL_B} dur="15s" animate={animate} fill="url(#nawa-band-2)" />
        <Band
          a={B1_LINE_A}
          b={B1_LINE_B}
          dur="11s"
          animate={animate}
          fill="none"
          stroke={brand.violetSoft}
          strokeWidth="1"
          opacity="0.6"
        />
        <Band
          a={B2_LINE_A}
          b={B2_LINE_B}
          dur="15s"
          animate={animate}
          fill="none"
          stroke={brand.violetSoft}
          strokeWidth="1"
          opacity="0.5"
        />
      </svg>
    </div>
  )
}
