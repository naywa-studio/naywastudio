'use client'

import { useEffect, useRef } from 'react'

/**
 * Naywa Studio — Flowing fluid shader background.
 *
 * Inspired by shader.se — a premium WebGL "fluid" layer that spans the full
 * page, reacts to mouse (spring) and scroll, and sits under the content as a
 * soft atmospheric presence rather than a decoration.
 *
 * Implementation notes:
 * - Fixed full-viewport canvas rendered with a fullscreen fragment shader.
 * - Domain-warped fbm (simplex) gives organic "shader fluid" motion.
 * - Output stays close to white with violet tints → combined with
 *   `mix-blend-mode: multiply` it tints the white page subtly without
 *   harming text readability.
 * - Scroll offsets the noise field so scrolling feels like traveling
 *   through the shader — unifying hero + every section below.
 * - Spring-damped mouse follows the cursor and adds a soft violet bloom.
 *
 * Variants — chaque page publique peut choisir une disposition différente
 * des bandes diagonales pour éviter le copier-coller :
 *   - home      : bas-gauche vers haut-droite (par défaut)
 *   - solutions : haut-gauche vers bas-droite (inverse)
 *   - about     : bandes horizontales basses
 *   - tarifs    : bandes verticales décalées
 *   - contact   : bandes plus serrées au centre
 *   - faq       : bandes inversées + élevées
 *   - legal     : bande unique discrète en haut
 */
export type ShaderVariant =
  | 'home' | 'solutions' | 'about' | 'tarifs' | 'contact' | 'faq' | 'legal'

interface ShaderBackgroundProps {
  variant?: ShaderVariant
}

export function ShaderBackground({ variant = 'home' }: ShaderBackgroundProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const gl = canvas.getContext('webgl', {
      antialias: false,
      alpha: true,
      premultipliedAlpha: true,
      powerPreference: 'high-performance',
    })
    if (!gl) return

    // ── Shaders ─────────────────────────────────────────────────────────
    const vertSrc = `
      attribute vec2 aPos;
      void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
    `

    const fragSrc = `
      precision highp float;

      uniform vec2  uRes;
      uniform float uTime;
      uniform float uScroll;     // 0..1 across document
      uniform float uDpr;

      // ── Simplex 2D noise (Ashima) ──────────────────────────────────
      vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }
      float snoise(vec2 v){
        const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                           -0.577350269189626, 0.024390243902439);
        vec2 i  = floor(v + dot(v, C.yy));
        vec2 x0 = v -   i + dot(i, C.xx);
        vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
        vec4 x12 = x0.xyxy + C.xxzz; x12.xy -= i1;
        i = mod(i, 289.0);
        vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0))
                        + i.x + vec3(0.0, i1.x, 1.0));
        vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy),
                                dot(x12.zw,x12.zw)), 0.0);
        m = m*m; m = m*m;
        vec3 x = 2.0 * fract(p * C.www) - 1.0;
        vec3 h = abs(x) - 0.5;
        vec3 ox = floor(x + 0.5);
        vec3 a0 = x - ox;
        m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
        vec3 g;
        g.x  = a0.x  * x0.x  + h.x  * x0.y;
        g.yz = a0.yz * x12.xz + h.yz * x12.yw;
        return 130.0 * dot(m, g);
      }

      // 4-octave fbm
      float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 5; i++) {
          v += a * snoise(p);
          p = p * 2.02 + vec2(1.7, 9.2);
          a *= 0.5;
        }
        return v;
      }

      // Cheap hash for grain
      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }

      void main() {
        // Normalized coords, aspect-corrected
        vec2 uv = gl_FragCoord.xy / uRes;
        vec2 p = uv;
        p.x *= uRes.x / uRes.y;
        vec2 pd = p;

        float t = uTime * 0.035;

        // ── FAR layer (parallax ~0.6x): slow, large-scale wash ─────
        float sFar  = uScroll * 2.0;
        vec2 qFar = vec2(
          fbm(pd * 0.9 + vec2(0.0, t * 0.6 + sFar * 0.35)),
          fbm(pd * 0.9 + vec2(5.2, -t * 0.6 + sFar * 0.35) + 1.3)
        );
        float nFar = fbm(pd * 1.0 + qFar * 1.2 + vec2(0.0, sFar));
        nFar = nFar * 0.5 + 0.5;

        // ── NEAR layer (parallax ~1.4x): crisper, faster domain warp
        float sNear = uScroll * 4.6;
        vec2 qNear = vec2(
          fbm(pd * 1.4 + vec2(0.0, t + sNear * 0.6)),
          fbm(pd * 1.4 + vec2(5.2, -t + sNear * 0.6) + 1.3)
        );
        vec2 rNear = vec2(
          fbm(pd * 2.0 + qNear * 1.6 + vec2(1.7 + t, 9.2)),
          fbm(pd * 2.0 + qNear * 1.6 + vec2(8.3, 2.8 - t))
        );
        float nNear = fbm(pd * 1.8 + rNear * 1.5 + vec2(sNear * 0.4, sNear));
        nNear = nNear * 0.5 + 0.5;

        // Blend the two parallax layers → depth + motion parallax
        float n = mix(nFar, nNear, 0.55);

        // ── Nawa palette ───────────────────────────────────────────
        vec3 white    = vec3(1.000, 1.000, 1.000);
        vec3 mist     = vec3(0.965, 0.956, 0.988); // #F6F4FC
        vec3 softV    = vec3(0.855, 0.827, 0.949); // #DBD3F2
        vec3 violet   = vec3(0.722, 0.682, 0.871); // #B8AEDE

        // Flowing color stack — mostly near-white, occasional violet
        float tint1 = smoothstep(0.35, 0.75, n);
        float tint2 = smoothstep(0.62, 0.98, n);
        vec3  col   = mix(mist,  softV,  tint1 * 0.85);
              col   = mix(col,   violet, tint2 * 0.55);

        // Film grain — very subtle, keeps the surface alive
        float g = hash(gl_FragCoord.xy + vec2(uTime * 37.0, uTime * 53.0));
        col += (g - 0.5) * 0.022;

        gl_FragColor = vec4(col, 1.0);
      }
    `

    // ── Compile ────────────────────────────────────────────────────────
    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!
      gl.shaderSource(sh, src)
      gl.compileShader(sh)
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(sh))
        gl.deleteShader(sh)
        return null
      }
      return sh
    }

    const vs = compile(gl.VERTEX_SHADER, vertSrc)
    const fs = compile(gl.FRAGMENT_SHADER, fragSrc)
    if (!vs || !fs) return

    const prog = gl.createProgram()!
    gl.attachShader(prog, vs)
    gl.attachShader(prog, fs)
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error(gl.getProgramInfoLog(prog))
      return
    }
    gl.useProgram(prog)

    // Fullscreen quad
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW
    )
    const aPos = gl.getAttribLocation(prog, 'aPos')
    gl.enableVertexAttribArray(aPos)
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)

    const uRes    = gl.getUniformLocation(prog, 'uRes')
    const uTime   = gl.getUniformLocation(prog, 'uTime')
    const uScroll = gl.getUniformLocation(prog, 'uScroll')
    const uDpr    = gl.getUniformLocation(prog, 'uDpr')

    // ── State ──────────────────────────────────────────────────────────
    const dpr = Math.min(window.devicePixelRatio || 1, 1.75)
    const state = {
      w: 0,
      h: 0,
      scroll: 0,
      scrollY: 0,
    }

    const resize = () => {
      state.w = window.innerWidth
      state.h = window.innerHeight
      canvas.width  = Math.floor(state.w * dpr)
      canvas.height = Math.floor(state.h * dpr)
      canvas.style.width  = state.w + 'px'
      canvas.style.height = state.h + 'px'
      gl.viewport(0, 0, canvas.width, canvas.height)
    }

    const onScroll = () => {
      const max = Math.max(1, document.documentElement.scrollHeight - state.h)
      state.scrollY = window.scrollY
      state.scroll  = window.scrollY / max
    }

    resize()
    onScroll()
    window.addEventListener('resize', resize)
    window.addEventListener('scroll', onScroll, { passive: true })

    // ── Render loop ────────────────────────────────────────────────────
    const start = performance.now()
    let raf = 0

    const tick = () => {
      raf = requestAnimationFrame(tick)

      const time = (performance.now() - start) / 1000

      gl.uniform2f(uRes, canvas.width, canvas.height)
      gl.uniform1f(uTime, time)
      gl.uniform1f(uScroll, state.scroll)
      gl.uniform1f(uDpr, dpr)

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      window.removeEventListener('scroll', onScroll)
      gl.deleteBuffer(buf)
      gl.deleteProgram(prog)
      gl.deleteShader(vs)
      gl.deleteShader(fs)
    }
  }, [])

  // ── Band path keyframes (objectBoundingBox coords) ─────────────────
  //
  // Pour chaque variant, on définit deux bandes parallèles avec un keyframe
  // central qui bouge subtilement (animation). Chaque bande a 3 paths :
  //   - F : fill (zone fermée pour le clipPath)
  //   - T : top edge (path ouvert, dessin du bord supérieur)
  //   - B : bottom edge (path ouvert, dessin du bord inférieur)
  //
  // Les variants jouent sur l'angle et l'origine pour donner à chaque
  // page une disposition unique sans changer la matière (le shader).
  const bands = BAND_PRESETS[variant]
  const b1F = bands.b1F
  const b1T = bands.b1T
  const b1B = bands.b1B
  const b2F = bands.b2F
  const b2T = bands.b2T
  const b2B = bands.b2B

  const spline = '0.45 0 0.55 1;0.45 0 0.55 1'
  const kTimes = '0;0.5;1'

  return (
    <>
      {/* Clip-path defs — 2 thin animated bands */}
      <svg aria-hidden width="0" height="0" style={{ position: 'absolute' }}>
        <defs>
          <clipPath id="nawa-bands" clipPathUnits="objectBoundingBox">
            <path>
              <animate attributeName="d" dur="11s" repeatCount="indefinite"
                calcMode="spline" keyTimes={kTimes} keySplines={spline} values={b1F} />
            </path>
            <path>
              <animate attributeName="d" dur="15s" repeatCount="indefinite"
                calcMode="spline" keyTimes={kTimes} keySplines={spline} values={b2F} />
            </path>
          </clipPath>
        </defs>
      </svg>

      {/* WebGL canvas, clipped to the two bands */}
      <canvas
        ref={canvasRef}
        aria-hidden
        style={{
          position:      'fixed',
          inset:         0,
          width:         '100%',
          height:        '100%',
          pointerEvents: 'none',
          zIndex:        0,
          clipPath:      'url(#nawa-bands)',
        }}
      />

      {/* Animated band borders — drawn over the canvas */}
      <svg
        aria-hidden
        viewBox="0 0 1 1"
        preserveAspectRatio="none"
        style={{
          position:      'fixed',
          inset:         0,
          width:         '100%',
          height:        '100%',
          pointerEvents: 'none',
          zIndex:        1,
          overflow:      'visible',
        }}
      >
        {/* Band 1 edges */}
        <path fill="none" stroke="rgba(184,174,222,0.65)" strokeWidth="1.5"
          vectorEffect="non-scaling-stroke">
          <animate attributeName="d" dur="11s" repeatCount="indefinite"
            calcMode="spline" keyTimes={kTimes} keySplines={spline} values={b1T} />
        </path>
        <path fill="none" stroke="rgba(184,174,222,0.65)" strokeWidth="1.5"
          vectorEffect="non-scaling-stroke">
          <animate attributeName="d" dur="11s" repeatCount="indefinite"
            calcMode="spline" keyTimes={kTimes} keySplines={spline} values={b1B} />
        </path>
        {/* Band 2 edges */}
        <path fill="none" stroke="rgba(184,174,222,0.50)" strokeWidth="1.2"
          vectorEffect="non-scaling-stroke">
          <animate attributeName="d" dur="15s" repeatCount="indefinite"
            calcMode="spline" keyTimes={kTimes} keySplines={spline} values={b2T} />
        </path>
        <path fill="none" stroke="rgba(184,174,222,0.50)" strokeWidth="1.2"
          vectorEffect="non-scaling-stroke">
          <animate attributeName="d" dur="15s" repeatCount="indefinite"
            calcMode="spline" keyTimes={kTimes} keySplines={spline} values={b2B} />
        </path>
      </svg>
    </>
  )
}

/* ──────────────────────────────────────────────────────────────────────────
 * BAND_PRESETS — paths animés (objectBoundingBox 0..1) pour chaque variant.
 *
 * Chaque preset livre 6 chaînes (3 keyframes par chaîne, séparés par ; ),
 * dans le format SVG <animate values="..."> :
 *   b1F / b2F : zones fermées (clipPath fill)
 *   b1T / b2T : bord supérieur (path ouvert)
 *   b1B / b2B : bord inférieur (path ouvert)
 *
 * Le keyframe central (index 1) est volontairement décalé de quelques
 * centièmes — c'est ce qui crée l'ondulation lente quand la bande "respire".
 * ────────────────────────────────────────────────────────────────────────── */

interface BandPreset {
  b1F: string; b1T: string; b1B: string
  b2F: string; b2T: string; b2B: string
}

const BAND_PRESETS: Record<ShaderVariant, BandPreset> = {
  // Default : 2 bandes diagonales / (bas-gauche → haut-droite)
  home: {
    b1F: 'M0,0.50 C0.15,0.62 0.85,0.16 1,0.20 L1,0.33 C0.85,0.29 0.15,0.75 0,0.63 Z;M0,0.51 C0.15,0.60 0.85,0.18 1,0.21 L1,0.34 C0.85,0.31 0.15,0.73 0,0.64 Z;M0,0.50 C0.15,0.62 0.85,0.16 1,0.20 L1,0.33 C0.85,0.29 0.15,0.75 0,0.63 Z',
    b1T: 'M0,0.50 C0.15,0.62 0.85,0.16 1,0.20;M0,0.51 C0.15,0.60 0.85,0.18 1,0.21;M0,0.50 C0.15,0.62 0.85,0.16 1,0.20',
    b1B: 'M0,0.63 C0.15,0.75 0.85,0.29 1,0.33;M0,0.64 C0.15,0.73 0.85,0.31 1,0.34;M0,0.63 C0.15,0.75 0.85,0.29 1,0.33',
    b2F: 'M0,0.67 C0.15,0.79 0.85,0.33 1,0.37 L1,0.50 C0.85,0.46 0.15,0.92 0,0.80 Z;M0,0.68 C0.15,0.77 0.85,0.35 1,0.38 L1,0.51 C0.85,0.48 0.15,0.90 0,0.81 Z;M0,0.67 C0.15,0.79 0.85,0.33 1,0.37 L1,0.50 C0.85,0.46 0.15,0.92 0,0.80 Z',
    b2T: 'M0,0.67 C0.15,0.79 0.85,0.33 1,0.37;M0,0.68 C0.15,0.77 0.85,0.35 1,0.38;M0,0.67 C0.15,0.79 0.85,0.33 1,0.37',
    b2B: 'M0,0.80 C0.15,0.92 0.85,0.46 1,0.50;M0,0.81 C0.15,0.90 0.85,0.48 1,0.51;M0,0.80 C0.15,0.92 0.85,0.46 1,0.50',
  },
  // Solutions : 2 bandes \ (haut-gauche → bas-droite) — opposé de home
  solutions: {
    b1F: 'M0,0.20 C0.15,0.16 0.85,0.62 1,0.50 L1,0.63 C0.85,0.75 0.15,0.29 0,0.33 Z;M0,0.21 C0.15,0.18 0.85,0.60 1,0.51 L1,0.64 C0.85,0.73 0.15,0.31 0,0.34 Z;M0,0.20 C0.15,0.16 0.85,0.62 1,0.50 L1,0.63 C0.85,0.75 0.15,0.29 0,0.33 Z',
    b1T: 'M0,0.20 C0.15,0.16 0.85,0.62 1,0.50;M0,0.21 C0.15,0.18 0.85,0.60 1,0.51;M0,0.20 C0.15,0.16 0.85,0.62 1,0.50',
    b1B: 'M0,0.33 C0.15,0.29 0.85,0.75 1,0.63;M0,0.34 C0.15,0.31 0.85,0.73 1,0.64;M0,0.33 C0.15,0.29 0.85,0.75 1,0.63',
    b2F: 'M0,0.37 C0.15,0.33 0.85,0.79 1,0.67 L1,0.80 C0.85,0.92 0.15,0.46 0,0.50 Z;M0,0.38 C0.15,0.35 0.85,0.77 1,0.68 L1,0.81 C0.85,0.90 0.15,0.48 0,0.51 Z;M0,0.37 C0.15,0.33 0.85,0.79 1,0.67 L1,0.80 C0.85,0.92 0.15,0.46 0,0.50 Z',
    b2T: 'M0,0.37 C0.15,0.33 0.85,0.79 1,0.67;M0,0.38 C0.15,0.35 0.85,0.77 1,0.68;M0,0.37 C0.15,0.33 0.85,0.79 1,0.67',
    b2B: 'M0,0.50 C0.15,0.46 0.85,0.92 1,0.80;M0,0.51 C0.15,0.48 0.85,0.90 1,0.81;M0,0.50 C0.15,0.46 0.85,0.92 1,0.80',
  },
  // À propos : 2 bandes horizontales basses, presque parallèles
  about: {
    b1F: 'M0,0.55 C0.30,0.50 0.70,0.60 1,0.55 L1,0.68 C0.70,0.73 0.30,0.63 0,0.68 Z;M0,0.56 C0.30,0.51 0.70,0.59 1,0.56 L1,0.69 C0.70,0.72 0.30,0.64 0,0.69 Z;M0,0.55 C0.30,0.50 0.70,0.60 1,0.55 L1,0.68 C0.70,0.73 0.30,0.63 0,0.68 Z',
    b1T: 'M0,0.55 C0.30,0.50 0.70,0.60 1,0.55;M0,0.56 C0.30,0.51 0.70,0.59 1,0.56;M0,0.55 C0.30,0.50 0.70,0.60 1,0.55',
    b1B: 'M0,0.68 C0.30,0.63 0.70,0.73 1,0.68;M0,0.69 C0.30,0.64 0.70,0.72 1,0.69;M0,0.68 C0.30,0.63 0.70,0.73 1,0.68',
    b2F: 'M0,0.78 C0.30,0.74 0.70,0.82 1,0.78 L1,0.90 C0.70,0.94 0.30,0.86 0,0.90 Z;M0,0.79 C0.30,0.75 0.70,0.81 1,0.79 L1,0.91 C0.70,0.93 0.30,0.87 0,0.91 Z;M0,0.78 C0.30,0.74 0.70,0.82 1,0.78 L1,0.90 C0.70,0.94 0.30,0.86 0,0.90 Z',
    b2T: 'M0,0.78 C0.30,0.74 0.70,0.82 1,0.78;M0,0.79 C0.30,0.75 0.70,0.81 1,0.79;M0,0.78 C0.30,0.74 0.70,0.82 1,0.78',
    b2B: 'M0,0.90 C0.30,0.86 0.70,0.94 1,0.90;M0,0.91 C0.30,0.87 0.70,0.93 1,0.91;M0,0.90 C0.30,0.86 0.70,0.94 1,0.90',
  },
  // Tarifs : bandes en V (haut + bas convergent vers le centre droit)
  tarifs: {
    b1F: 'M0,0.10 C0.30,0.18 0.70,0.42 1,0.50 L1,0.63 C0.70,0.55 0.30,0.31 0,0.23 Z;M0,0.11 C0.30,0.19 0.70,0.41 1,0.51 L1,0.64 C0.70,0.54 0.30,0.32 0,0.24 Z;M0,0.10 C0.30,0.18 0.70,0.42 1,0.50 L1,0.63 C0.70,0.55 0.30,0.31 0,0.23 Z',
    b1T: 'M0,0.10 C0.30,0.18 0.70,0.42 1,0.50;M0,0.11 C0.30,0.19 0.70,0.41 1,0.51;M0,0.10 C0.30,0.18 0.70,0.42 1,0.50',
    b1B: 'M0,0.23 C0.30,0.31 0.70,0.55 1,0.63;M0,0.24 C0.30,0.32 0.70,0.54 1,0.64;M0,0.23 C0.30,0.31 0.70,0.55 1,0.63',
    b2F: 'M0,0.92 C0.30,0.85 0.70,0.65 1,0.50 L1,0.63 C0.70,0.78 0.30,0.98 0,1.05 Z;M0,0.93 C0.30,0.84 0.70,0.66 1,0.51 L1,0.64 C0.70,0.79 0.30,0.97 0,1.06 Z;M0,0.92 C0.30,0.85 0.70,0.65 1,0.50 L1,0.63 C0.70,0.78 0.30,0.98 0,1.05 Z',
    b2T: 'M0,0.92 C0.30,0.85 0.70,0.65 1,0.50;M0,0.93 C0.30,0.84 0.70,0.66 1,0.51;M0,0.92 C0.30,0.85 0.70,0.65 1,0.50',
    b2B: 'M0,1.05 C0.30,0.98 0.70,0.78 1,0.63;M0,1.06 C0.30,0.97 0.70,0.79 1,0.64;M0,1.05 C0.30,0.98 0.70,0.78 1,0.63',
  },
  // Contact : bandes serrées au centre, presque verticales
  contact: {
    b1F: 'M0.20,0 C0.18,0.30 0.32,0.70 0.30,1 L0.43,1 C0.45,0.70 0.31,0.30 0.33,0 Z;M0.21,0 C0.19,0.30 0.31,0.70 0.31,1 L0.44,1 C0.44,0.70 0.32,0.30 0.34,0 Z;M0.20,0 C0.18,0.30 0.32,0.70 0.30,1 L0.43,1 C0.45,0.70 0.31,0.30 0.33,0 Z',
    b1T: 'M0.33,0 C0.31,0.30 0.45,0.70 0.43,1;M0.34,0 C0.32,0.30 0.44,0.70 0.44,1;M0.33,0 C0.31,0.30 0.45,0.70 0.43,1',
    b1B: 'M0.20,0 C0.18,0.30 0.32,0.70 0.30,1;M0.21,0 C0.19,0.30 0.31,0.70 0.31,1;M0.20,0 C0.18,0.30 0.32,0.70 0.30,1',
    b2F: 'M0.67,0 C0.69,0.30 0.55,0.70 0.57,1 L0.70,1 C0.68,0.70 0.82,0.30 0.80,0 Z;M0.68,0 C0.70,0.30 0.56,0.70 0.58,1 L0.71,1 C0.69,0.70 0.81,0.30 0.81,0 Z;M0.67,0 C0.69,0.30 0.55,0.70 0.57,1 L0.70,1 C0.68,0.70 0.82,0.30 0.80,0 Z',
    b2T: 'M0.80,0 C0.82,0.30 0.68,0.70 0.70,1;M0.81,0 C0.81,0.30 0.69,0.70 0.71,1;M0.80,0 C0.82,0.30 0.68,0.70 0.70,1',
    b2B: 'M0.67,0 C0.69,0.30 0.55,0.70 0.57,1;M0.68,0 C0.70,0.30 0.56,0.70 0.58,1;M0.67,0 C0.69,0.30 0.55,0.70 0.57,1',
  },
  // FAQ : 2 bandes diagonales inverses, plus hautes
  faq: {
    b1F: 'M0,0.10 C0.15,0.06 0.85,0.40 1,0.32 L1,0.45 C0.85,0.53 0.15,0.19 0,0.23 Z;M0,0.11 C0.15,0.08 0.85,0.38 1,0.33 L1,0.46 C0.85,0.51 0.15,0.21 0,0.24 Z;M0,0.10 C0.15,0.06 0.85,0.40 1,0.32 L1,0.45 C0.85,0.53 0.15,0.19 0,0.23 Z',
    b1T: 'M0,0.10 C0.15,0.06 0.85,0.40 1,0.32;M0,0.11 C0.15,0.08 0.85,0.38 1,0.33;M0,0.10 C0.15,0.06 0.85,0.40 1,0.32',
    b1B: 'M0,0.23 C0.15,0.19 0.85,0.53 1,0.45;M0,0.24 C0.15,0.21 0.85,0.51 1,0.46;M0,0.23 C0.15,0.19 0.85,0.53 1,0.45',
    b2F: 'M0,0.30 C0.15,0.26 0.85,0.58 1,0.50 L1,0.63 C0.85,0.71 0.15,0.39 0,0.43 Z;M0,0.31 C0.15,0.28 0.85,0.56 1,0.51 L1,0.64 C0.85,0.69 0.15,0.41 0,0.44 Z;M0,0.30 C0.15,0.26 0.85,0.58 1,0.50 L1,0.63 C0.85,0.71 0.15,0.39 0,0.43 Z',
    b2T: 'M0,0.30 C0.15,0.26 0.85,0.58 1,0.50;M0,0.31 C0.15,0.28 0.85,0.56 1,0.51;M0,0.30 C0.15,0.26 0.85,0.58 1,0.50',
    b2B: 'M0,0.43 C0.15,0.39 0.85,0.71 1,0.63;M0,0.44 C0.15,0.41 0.85,0.69 1,0.64;M0,0.43 C0.15,0.39 0.85,0.71 1,0.63',
  },
  // Legal : une seule bande très discrète en bas
  legal: {
    b1F: 'M0,0.86 C0.30,0.82 0.70,0.90 1,0.86 L1,0.94 C0.70,0.98 0.30,0.90 0,0.94 Z;M0,0.87 C0.30,0.83 0.70,0.89 1,0.87 L1,0.95 C0.70,0.97 0.30,0.91 0,0.95 Z;M0,0.86 C0.30,0.82 0.70,0.90 1,0.86 L1,0.94 C0.70,0.98 0.30,0.90 0,0.94 Z',
    b1T: 'M0,0.86 C0.30,0.82 0.70,0.90 1,0.86;M0,0.87 C0.30,0.83 0.70,0.89 1,0.87;M0,0.86 C0.30,0.82 0.70,0.90 1,0.86',
    b1B: 'M0,0.94 C0.30,0.90 0.70,0.98 1,0.94;M0,0.95 C0.30,0.91 0.70,0.97 1,0.95;M0,0.94 C0.30,0.90 0.70,0.98 1,0.94',
    // Bande 2 : invisible (path quasi-nul replié sur lui-même hors-écran)
    b2F: 'M-1,-1 L-1,-0.99 L-0.99,-0.99 L-0.99,-1 Z;M-1,-1 L-1,-0.99 L-0.99,-0.99 L-0.99,-1 Z;M-1,-1 L-1,-0.99 L-0.99,-0.99 L-0.99,-1 Z',
    b2T: 'M-1,-1 L-1,-1;M-1,-1 L-1,-1;M-1,-1 L-1,-1',
    b2B: 'M-1,-1 L-1,-1;M-1,-1 L-1,-1;M-1,-1 L-1,-1',
  },
}
