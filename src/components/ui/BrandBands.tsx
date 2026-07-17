'use client'

import { useEffect, useState } from 'react'
import { brand } from '@/lib/brand'

/**
 * Naywa Studio — Bandes signature (charte v2.0, §03 « Motif de marque »).
 *
 * Deux flux diagonaux qui glissent lentement, bas-gauche → haut-droite
 * (« le process qui coule d'une étape à l'autre »). Toujours ascendants,
 * jamais inversés. Cadence 11s + 15s, ease 0.45 0 0.55 1. Opacité faible :
 * le motif reste en arrière-plan, le contenu toujours lisible par-dessus.
 *
 * Remplace `ShaderBackground` (WebGL) sur la vitrine : le shader plein écran
 * qui redessinait en continu + recalculait à chaque scroll faisait ramer le
 * défilement sur PC. Ici, tout est en SVG/SMIL : pas de canvas, pas de
 * `requestAnimationFrame`, pas de listener scroll. Sur un fond papier sable.
 *
 * `prefers-reduced-motion` : on rend les bandes en position figée (état
 * médian), sans balise `<animate>`.
 */

// Géométrie des bandes en coordonnées objectBoundingBox (0..1). Trois clés
// d'animation (départ · milieu · retour) pour une ondulation imperceptible.
const B1_FILL =
  'M0,0.50 C0.15,0.62 0.85,0.16 1,0.20 L1,0.33 C0.85,0.29 0.15,0.75 0,0.63 Z;' +
  'M0,0.51 C0.15,0.60 0.85,0.18 1,0.21 L1,0.34 C0.85,0.31 0.15,0.73 0,0.64 Z;' +
  'M0,0.50 C0.15,0.62 0.85,0.16 1,0.20 L1,0.33 C0.85,0.29 0.15,0.75 0,0.63 Z'
const B1_TOP =
  'M0,0.50 C0.15,0.62 0.85,0.16 1,0.20;M0,0.51 C0.15,0.60 0.85,0.18 1,0.21;M0,0.50 C0.15,0.62 0.85,0.16 1,0.20'
const B1_BOTTOM =
  'M0,0.63 C0.15,0.75 0.85,0.29 1,0.33;M0,0.64 C0.15,0.73 0.85,0.31 1,0.34;M0,0.63 C0.15,0.75 0.85,0.29 1,0.33'

const B2_FILL =
  'M0,0.67 C0.15,0.79 0.85,0.33 1,0.37 L1,0.50 C0.85,0.46 0.15,0.92 0,0.80 Z;' +
  'M0,0.68 C0.15,0.77 0.85,0.35 1,0.38 L1,0.51 C0.85,0.48 0.15,0.90 0,0.81 Z;' +
  'M0,0.67 C0.15,0.79 0.85,0.33 1,0.37 L1,0.50 C0.85,0.46 0.15,0.92 0,0.80 Z'
const B2_TOP =
  'M0,0.67 C0.15,0.79 0.85,0.33 1,0.37;M0,0.68 C0.15,0.77 0.85,0.35 1,0.38;M0,0.67 C0.15,0.79 0.85,0.33 1,0.37'
const B2_BOTTOM =
  'M0,0.80 C0.15,0.92 0.85,0.46 1,0.50;M0,0.81 C0.15,0.90 0.85,0.48 1,0.51;M0,0.80 C0.15,0.92 0.85,0.46 1,0.50'

const SPLINE = '0.45 0 0.55 1;0.45 0 0.55 1'
const KTIMES = '0;0.5;1'

// État figé (1ʳᵉ clé) pour le fallback sans animation.
const still = (values: string) => values.split(';')[0]

function Animate({
  values,
  dur,
  animate,
}: {
  values: string
  dur: string
  animate: boolean
}) {
  if (!animate) return null
  return (
    <animate
      attributeName="d"
      dur={dur}
      repeatCount="indefinite"
      calcMode="spline"
      keyTimes={KTIMES}
      keySplines={SPLINE}
      values={values}
    />
  )
}

export function BrandBands() {
  // Rendu identique serveur/client au 1er paint (animate = true), puis on
  // coupe l'animation si l'utilisateur préfère la sobriété. Évite tout
  // mismatch d'hydratation (React 19 / Next 16).
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
        viewBox="0 0 1 1"
        preserveAspectRatio="none"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }}
      >
        <defs>
          {/* Dégradé de remplissage : violet très léger, ascendant. */}
          <linearGradient id="nawa-band-fill" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor={brand.violet} stopOpacity="0.05" />
            <stop offset="0.5" stopColor={brand.violet} stopOpacity="0.14" />
            <stop offset="1" stopColor={brand.violetSoft} stopOpacity="0.06" />
          </linearGradient>
          <linearGradient id="nawa-band-fill-2" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor={brand.violetSoft} stopOpacity="0.05" />
            <stop offset="0.5" stopColor={brand.violet} stopOpacity="0.10" />
            <stop offset="1" stopColor={brand.violet} stopOpacity="0.05" />
          </linearGradient>
        </defs>

        {/* Bande 1 — remplissage */}
        <path fill="url(#nawa-band-fill)" d={still(B1_FILL)}>
          <Animate values={B1_FILL} dur="11s" animate={animate} />
        </path>
        {/* Bande 2 — remplissage */}
        <path fill="url(#nawa-band-fill-2)" d={still(B2_FILL)}>
          <Animate values={B2_FILL} dur="15s" animate={animate} />
        </path>

        {/* Traits (bords) — stroke fin non-scaling, opacité 0.5 */}
        <g fill="none" stroke={brand.violetSoft} vectorEffect="non-scaling-stroke">
          <path strokeWidth="1.5" strokeOpacity="0.5" d={still(B1_TOP)}>
            <Animate values={B1_TOP} dur="11s" animate={animate} />
          </path>
          <path strokeWidth="1.5" strokeOpacity="0.5" d={still(B1_BOTTOM)}>
            <Animate values={B1_BOTTOM} dur="11s" animate={animate} />
          </path>
          <path strokeWidth="1.2" strokeOpacity="0.38" d={still(B2_TOP)}>
            <Animate values={B2_TOP} dur="15s" animate={animate} />
          </path>
          <path strokeWidth="1.2" strokeOpacity="0.38" d={still(B2_BOTTOM)}>
            <Animate values={B2_BOTTOM} dur="15s" animate={animate} />
          </path>
        </g>
      </svg>
    </div>
  )
}
