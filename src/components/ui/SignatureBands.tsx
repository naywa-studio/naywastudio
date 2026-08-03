'use client'

/**
 * Naywa Studio — Fond signature (charte v2.0, §03 « Motif de marque »).
 *
 * Deux rubans violets diagonaux (bas-gauche → haut-droite) sur papier sable,
 * avec une matière marbrée. Remplace `ShaderBackground` (shader WebGL plein
 * écran qui recalculait du bruit fractal ~8× par pixel à chaque frame + un
 * listener scroll → saccades sur petits PC).
 *
 * Coût runtime quasi nul, garanti sans lag :
 *  - la matière marbre/grain = deux `feTurbulence` RASTERISÉS UNE SEULE FOIS
 *    (data-URI = image statique, jamais recalculée) ;
 *  - le mouvement = `transform: translate3d` en keyframes CSS → compositeur
 *    GPU uniquement, aucun re-raster par frame, aucun `requestAnimationFrame`,
 *    aucun listener scroll, aucun WebGL ;
 *  - `prefers-reduced-motion` → tout est figé (rendu statique identique).
 *
 * La densité « marbrée » des rubans vient de la superposition de plusieurs
 * voiles de dégradés qui dérivent à des vitesses différentes (fausse
 * profondeur organique), pas d'un filtre coûteux sur un élément animé.
 */

// ── Matières (feTurbulence baké une fois en image) ───────────────────────────
const enc = (svg: string) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`

/** Grandes veines de marbre (basse fréquence). Étiré plein écran, statique. */
const MARBLE = enc(
  "<svg xmlns='http://www.w3.org/2000/svg' width='1200' height='800'>" +
    "<filter id='m'><feTurbulence type='fractalNoise' baseFrequency='0.010 0.016' numOctaves='3' seed='7'/>" +
    "<feColorMatrix type='saturate' values='0'/></filter>" +
    "<rect width='100%' height='100%' filter='url(#m)'/></svg>"
)

/** Grain fin (haute fréquence, tuilable). Répété, statique. Donne la « tooth » papier. */
const GRAIN = enc(
  "<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'>" +
    "<filter id='g'><feTurbulence type='fractalNoise' baseFrequency='0.72' numOctaves='2' stitchTiles='stitch'/>" +
    "<feColorMatrix type='saturate' values='0'/></filter>" +
    "<rect width='100%' height='100%' filter='url(#g)'/></svg>"
)

const CSS = `
.nsb-root{position:fixed;inset:0;z-index:0;pointer-events:none;overflow:hidden;background:#FDFCF9;contain:strict}
.nsb-marble{position:absolute;inset:0;background-image:${MARBLE};background-size:cover;
  mix-blend-mode:soft-light;opacity:.55}
.nsb-grain{position:absolute;inset:0;background-image:${GRAIN};background-repeat:repeat;
  mix-blend-mode:soft-light;opacity:.22}
.nsb-glow{position:absolute;border-radius:50%;filter:blur(60px);will-change:transform,opacity}
.nsb-glow-1{top:-14%;right:-6%;width:52vw;height:52vw;
  background:radial-gradient(circle,rgba(123,99,200,.10),rgba(123,99,200,0) 68%);
  animation:nsbBreathe 20s ease-in-out infinite}
.nsb-glow-2{bottom:-18%;left:-10%;width:46vw;height:46vw;
  background:radial-gradient(circle,rgba(184,174,222,.10),rgba(184,174,222,0) 66%);
  animation:nsbBreathe 26s ease-in-out infinite reverse}
.nsb-band{position:absolute;inset:-9%;width:118%;height:118%;will-change:transform}
.nsb-band svg{width:100%;height:100%;display:block}
.nsb-band-1{animation:nsbDrift1 27s ease-in-out infinite}
.nsb-band-2{animation:nsbDrift2 35s ease-in-out infinite}
@keyframes nsbDrift1{0%{transform:translate3d(-1.1%,.7%,0)}50%{transform:translate3d(1.1%,-.7%,0)}100%{transform:translate3d(-1.1%,.7%,0)}}
@keyframes nsbDrift2{0%{transform:translate3d(1%,-.6%,0)}50%{transform:translate3d(-1%,.6%,0)}100%{transform:translate3d(1%,-.6%,0)}}
@keyframes nsbBreathe{0%,100%{transform:scale(1);opacity:.75}50%{transform:scale(1.12);opacity:1}}
@media (prefers-reduced-motion: reduce){.nsb-band,.nsb-glow{animation:none!important}}
`

export function SignatureBands() {
  return (
    <div aria-hidden className="nsb-root">
      <style>{CSS}</style>

      <div className="nsb-marble" />
      <div className="nsb-grain" />
      <div className="nsb-glow nsb-glow-1" />
      <div className="nsb-glow nsb-glow-2" />

      {/* Ruban 1 (supérieur) — violet vif → doux */}
      <div className="nsb-band nsb-band-1">
        <svg viewBox="0 0 1440 900" preserveAspectRatio="none">
          <defs>
            <linearGradient id="nsb-b1a" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#7B63C8" stopOpacity="0.26" />
              <stop offset="1" stopColor="#B8AEDE" stopOpacity="0.06" />
            </linearGradient>
            <linearGradient id="nsb-b1b" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#4B3A8F" stopOpacity="0.13" />
              <stop offset="1" stopColor="#7B63C8" stopOpacity="0.04" />
            </linearGradient>
          </defs>
          {/* voile d'écho (décalé) = densité marbrée */}
          <path
            d="M-160 452 C 320 330, 900 486, 1600 300 L1600 372 C 900 548, 320 396, -160 516 Z"
            fill="url(#nsb-b1b)"
          />
          {/* ruban principal */}
          <path
            d="M-160 480 C 320 358, 900 512, 1600 328 L1600 424 C 900 600, 320 448, -160 568 Z"
            fill="url(#nsb-b1a)"
          />
          {/* veine centrale */}
          <path
            d="M-160 516 C 320 394, 900 548, 1600 364"
            fill="none"
            stroke="#B8AEDE"
            strokeOpacity="0.5"
            strokeWidth="1.1"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>

      {/* Ruban 2 (inférieur) — prune → violet */}
      <div className="nsb-band nsb-band-2">
        <svg viewBox="0 0 1440 900" preserveAspectRatio="none">
          <defs>
            <linearGradient id="nsb-b2a" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#4B3A8F" stopOpacity="0.18" />
              <stop offset="1" stopColor="#7B63C8" stopOpacity="0.05" />
            </linearGradient>
            <linearGradient id="nsb-b2b" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#7B63C8" stopOpacity="0.12" />
              <stop offset="1" stopColor="#B8AEDE" stopOpacity="0.04" />
            </linearGradient>
          </defs>
          <path
            d="M-160 610 C 320 490, 900 648, 1600 470 L1600 540 C 900 716, 320 566, -160 686 Z"
            fill="url(#nsb-b2b)"
          />
          <path
            d="M-160 640 C 320 520, 900 678, 1600 500 L1600 596 C 900 772, 320 622, -160 742 Z"
            fill="url(#nsb-b2a)"
          />
          <path
            d="M-160 676 C 320 556, 900 714, 1600 536"
            fill="none"
            stroke="#B8AEDE"
            strokeOpacity="0.42"
            strokeWidth="1.1"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>
    </div>
  )
}
