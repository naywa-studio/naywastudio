'use client'

import { useEffect, useState } from 'react'
import { brand } from '@/lib/brand'

/**
 * Naywa Studio — Fond de marque : marbre violet sur papier.
 *
 * HISTORIQUE, pour ne pas refaire le tour :
 *  1. `ShaderBackground` (WebGL) donnait le marbre qu'on veut, mais il
 *     redessinait en continu ET recalculait au scroll → saccades sur PC.
 *  2. On l'a remplacé par des rubans SVG à dégradé plat : fluide, mais sans
 *     matière — « trop monotone ».
 *  3. Ici : on retrouve la MATIÈRE du shader sans son coût.
 *
 * Comment : le marbre vient d'un `feTurbulence` (bruit fractal) teinté en
 * violet, que le navigateur rastérise UNE FOIS. L'animation ne touche ensuite
 * qu'un `transform` sur le conteneur — propriété prise en charge par le
 * compositeur, donc ni recalcul de mise en page ni repeinture.
 *
 * ⚠️ RÈGLE : aucun écouteur de scroll, jamais. C'était la cause du lag, pas
 * l'animation elle-même. Rien ici ne lit la position de défilement.
 *
 * `prefers-reduced-motion` fige les deux nappes.
 */

// Rubans diagonaux de la charte (bas-gauche → haut-droite). Ils ne sont plus
// peints directement : ils servent de MASQUE, pour que le marbre soit plus
// dense le long de la géométrie de marque et plus diffus ailleurs.
const BAND_1 =
  'M-60 470 C 360 350, 1000 620, 1500 400 L 1500 545 C 1000 762, 360 486, -60 610 Z'
const BAND_2 =
  'M-60 648 C 360 520, 1000 796, 1500 574 L 1500 706 C 1000 928, 360 656, -60 778 Z'

export function BrandBands() {
  // 1er rendu identique serveur/client, puis on coupe si l'utilisateur
  // préfère la sobriété. Pas de décalage d'hydratation.
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
        overflow: 'hidden',
      }}
    >
      {/* Deux nappes de marbre superposées, dérivant hors phase et à des
          échelles différentes : c'est leur croisement lent qui donne
          l'impression de veines qui vivent, sans qu'aucune forme ne soit
          identifiable ni ne se répète. */}
      <div
        className="nw-marble"
        style={{
          position: 'absolute',
          inset: '-14%',
          animation: animate ? 'nwMarbleA 42s ease-in-out infinite' : undefined,
          willChange: 'transform',
        }}
      >
        <MarbleField seed={7} idSuffix="a" />
      </div>

      <div
        className="nw-marble"
        style={{
          position: 'absolute',
          inset: '-14%',
          opacity: 0.7,
          animation: animate ? 'nwMarbleB 58s ease-in-out infinite' : undefined,
          willChange: 'transform',
        }}
      >
        <MarbleField seed={23} idSuffix="b" />
      </div>
    </div>
  )
}

/**
 * Une nappe de marbre.
 *
 * `preserveAspectRatio="xMidYMid slice"` est essentiel : sans lui (ou avec
 * `none`), le bruit serait étiré horizontalement sur un écran large et le
 * marbre deviendrait un filé sale. « slice » garde les proportions et rogne.
 */
function MarbleField({ seed, idSuffix }: { seed: number; idSuffix: string }) {
  const filterId = `nw-marble-${idSuffix}`
  const maskId = `nw-bands-${idSuffix}`

  return (
    <svg
      viewBox="0 0 1440 800"
      preserveAspectRatio="xMidYMid slice"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
    >
      <defs>
        <filter
          id={filterId}
          x="-25%"
          y="-25%"
          width="150%"
          height="150%"
          colorInterpolationFilters="sRGB"
        >
          {/* Basse fréquence + nombreuses octaves = grandes volutes douces
              avec du détail dedans, c'est-à-dire du marbre. Une fréquence
              élevée donnerait du grain de film, pas des veines. */}
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.0055 0.009"
            numOctaves={5}
            seed={seed}
            result="noise"
          />
          {/* Le bruit sort en niveaux de gris : on force la COULEUR au violet
              de marque (constantes des 3 premières lignes) et on pilote
              l'OPACITÉ avec le canal rouge du bruit (dernière ligne). D'où
              des veines violettes plus ou moins denses sur le papier. */}
          <feColorMatrix
            in="noise"
            type="matrix"
            values="0 0 0 0 0.482
                    0 0 0 0 0.388
                    0 0 0 0 0.784
                    0.62 0 0 0 -0.17"
          />
        </filter>

        <mask id={maskId}>
          {/* Noir = marbre presque effacé, blanc = marbre plein.
              Le gris de fond laisse une trace de matière sur tout l'écran ;
              les rubans en blanc la concentrent sur la diagonale de marque. */}
          <rect width="1440" height="800" fill="#2b2b2b" />
          <path d={BAND_1} fill="#ffffff" />
          <path d={BAND_2} fill="#e8e8e8" />
        </mask>
      </defs>

      <g mask={`url(#${maskId})`}>
        <rect width="1440" height="800" filter={`url(#${filterId})`} opacity="0.62" />
      </g>
    </svg>
  )
}
