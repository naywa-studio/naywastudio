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

// Veines fines : le détail qui donne le « marbre ». Même diagonale que les
// rubans, mais décalées et beaucoup plus lentes, pour que l'œil accroche
// quelque chose sans jamais voir le mouvement.
const V1_A = 'M-40 258 C 260 176, 600 372, 940 236'
const V1_B = 'M-40 268 C 260 190, 600 358, 940 224'
const V2_A = 'M-40 340 C 220 268, 640 452, 940 322'
const V2_B = 'M-40 352 C 220 282, 640 438, 940 308'

const KTIMES = '0;0.5;1'
const SPLINE = '0.45 0 0.55 1;0.45 0 0.55 1'

/**
 * Grain — tuile de bruit générée par `feTurbulence`, encodée en data-URI et
 * répétée en `background-image`. Le navigateur la rastérise UNE fois puis la
 * compose : coût d'exécution nul, aucun repaint au scroll, quelques centaines
 * d'octets. C'est ce qui rend la texture « papier / marbre » que le rendu à
 * plat n'avait pas.
 */
const GRAIN_URI =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23g)'/%3E%3C/svg%3E\")"

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
        background: brand.paper,
      }}
    >
      {/* Voiles de profondeur — deux nappes très diffuses qui respirent hors
          phase. Elles empêchent le fond de se lire comme un aplat uniforme.
          Animées en transform uniquement (compositeur). */}
      <div
        className="nw-wash"
        style={{
          position: 'absolute',
          inset: '-20%',
          background: `radial-gradient(46% 42% at 24% 30%, ${brand.violet}1F 0%, transparent 68%)`,
          animation: animate ? 'nwWashA 26s ease-in-out infinite' : undefined,
          willChange: 'transform',
        }}
      />
      <div
        className="nw-wash"
        style={{
          position: 'absolute',
          inset: '-20%',
          background: `radial-gradient(52% 44% at 78% 68%, ${brand.violetDeep}17 0%, transparent 70%)`,
          animation: animate ? 'nwWashB 34s ease-in-out infinite' : undefined,
          willChange: 'transform',
        }}
      />

      <svg
        viewBox="0 0 900 500"
        preserveAspectRatio="none"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.55 }}
      >
        <defs>
          <linearGradient id="nawa-band-1" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={brand.violet} stopOpacity="0.13" />
            <stop offset="100%" stopColor={brand.violetSoft} stopOpacity="0.03" />
          </linearGradient>
          <linearGradient id="nawa-band-2" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={brand.violetDeep} stopOpacity="0.10" />
            <stop offset="100%" stopColor={brand.violet} stopOpacity="0.03" />
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

        {/* Veines — cadence volontairement décalée (23s / 29s) de celle des
            rubans : les croisements ne se répètent jamais au même endroit,
            ce qui casse la monotonie sans rien accélérer. */}
        <Band
          a={V1_A}
          b={V1_B}
          dur="23s"
          animate={animate}
          fill="none"
          stroke={brand.violetDeep}
          strokeWidth="0.6"
          opacity="0.22"
        />
        <Band
          a={V2_A}
          b={V2_B}
          dur="29s"
          animate={animate}
          fill="none"
          stroke={brand.violet}
          strokeWidth="0.5"
          opacity="0.18"
        />
      </svg>

      {/* Grain — la couche qui donne le « papier ». Posée en dernier pour
          texturer aussi bien les rubans que le fond. Rastérisée une fois,
          jamais réanimée. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: GRAIN_URI,
          backgroundRepeat: 'repeat',
          backgroundSize: '160px 160px',
          opacity: 0.03,
        }}
      />
    </div>
  )
}
