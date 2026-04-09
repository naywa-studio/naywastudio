'use client'

import { useEffect, useRef } from 'react'

/**
 * Nawa Studio — Flowing fluid shader background.
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
 */
export function ShaderBackground() {
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
      uniform vec2  uMouse;      // in pixels, with spring smoothing
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

        float t = uTime * 0.035;

        // ── FAR layer (parallax ~0.6x): slow, large-scale wash ─────
        float sFar  = uScroll * 2.0;
        vec2 qFar = vec2(
          fbm(p * 0.9 + vec2(0.0, t * 0.6 + sFar * 0.35)),
          fbm(p * 0.9 + vec2(5.2, -t * 0.6 + sFar * 0.35) + 1.3)
        );
        float nFar = fbm(p * 1.0 + qFar * 1.2 + vec2(0.0, sFar));
        nFar = nFar * 0.5 + 0.5;

        // ── NEAR layer (parallax ~1.4x): crisper, faster domain warp
        float sNear = uScroll * 4.6;
        vec2 qNear = vec2(
          fbm(p * 1.4 + vec2(0.0, t + sNear * 0.6)),
          fbm(p * 1.4 + vec2(5.2, -t + sNear * 0.6) + 1.3)
        );
        vec2 rNear = vec2(
          fbm(p * 2.0 + qNear * 1.6 + vec2(1.7 + t, 9.2)),
          fbm(p * 2.0 + qNear * 1.6 + vec2(8.3, 2.8 - t))
        );
        float nNear = fbm(p * 1.8 + rNear * 1.5 + vec2(sNear * 0.4, sNear));
        nNear = nNear * 0.5 + 0.5;

        // Blend the two parallax layers → depth + motion parallax
        float n = mix(nFar, nNear, 0.55);

        // Mouse spring bloom — soft violet glow under cursor
        vec2 m = uMouse / uRes;
        m.x *= uRes.x / uRes.y;
        float md = distance(p, m);
        float bloom = smoothstep(0.55, 0.0, md);
        bloom = pow(bloom, 1.6);

        // ── Nawa palette ───────────────────────────────────────────
        vec3 white    = vec3(1.000, 1.000, 1.000);
        vec3 mist     = vec3(0.965, 0.956, 0.988); // #F6F4FC
        vec3 softV    = vec3(0.855, 0.827, 0.949); // #DBD3F2
        vec3 violet   = vec3(0.722, 0.682, 0.871); // #B8AEDE
        vec3 deep     = vec3(0.486, 0.388, 0.784); // #7C63C8

        // Flowing color stack — mostly near-white, occasional violet
        float tint1 = smoothstep(0.35, 0.75, n);
        float tint2 = smoothstep(0.62, 0.98, n);
        vec3  col   = mix(mist,  softV,  tint1 * 0.85);
              col   = mix(col,   violet, tint2 * 0.55);

        // Mouse bloom pushes color toward deep violet around cursor
        col = mix(col, deep, bloom * 0.35);

        // Film grain — very subtle, keeps the surface alive
        float g = hash(gl_FragCoord.xy + vec2(uTime * 37.0, uTime * 53.0));
        col += (g - 0.5) * 0.018;

        // Vignette falloff — corners stay pure white
        vec2 vv = uv - 0.5;
        float vig = smoothstep(0.95, 0.25, length(vv));
        col = mix(white, col, vig * 0.92);

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
    const uMouse  = gl.getUniformLocation(prog, 'uMouse')
    const uTime   = gl.getUniformLocation(prog, 'uTime')
    const uScroll = gl.getUniformLocation(prog, 'uScroll')
    const uDpr    = gl.getUniformLocation(prog, 'uDpr')

    // ── State ──────────────────────────────────────────────────────────
    const dpr = Math.min(window.devicePixelRatio || 1, 1.75)
    const state = {
      w: 0,
      h: 0,
      mx: -9999,
      my: -9999,
      smx: -9999,
      smy: -9999,
      scroll: 0,
      scrollY: 0,
      parallaxY: 0,
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

    const onMove = (e: MouseEvent) => {
      state.mx = e.clientX * dpr
      state.my = (state.h - e.clientY) * dpr // flip Y for GL
    }
    const onLeave = () => { state.mx = -9999; state.my = -9999 }

    const onScroll = () => {
      const max = Math.max(1, document.documentElement.scrollHeight - state.h)
      state.scrollY = window.scrollY
      state.scroll  = window.scrollY / max
    }

    resize()
    onScroll()
    window.addEventListener('resize', resize)
    window.addEventListener('mousemove', onMove, { passive: true })
    window.addEventListener('mouseleave', onLeave)
    window.addEventListener('scroll', onScroll, { passive: true })

    // ── Render loop ────────────────────────────────────────────────────
    const start = performance.now()
    let raf = 0

    const tick = () => {
      raf = requestAnimationFrame(tick)

      // Spring-damped mouse for silky movement
      if (state.smx === -9999) { state.smx = state.mx; state.smy = state.my }
      state.smx += (state.mx - state.smx) * 0.08
      state.smy += (state.my - state.smy) * 0.08

      const time = (performance.now() - start) / 1000

      gl.uniform2f(uRes, canvas.width, canvas.height)
      gl.uniform2f(uMouse, state.smx, state.smy)
      gl.uniform1f(uTime, time)
      gl.uniform1f(uScroll, state.scroll)
      gl.uniform1f(uDpr, dpr)

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseleave', onLeave)
      window.removeEventListener('scroll', onScroll)
      gl.deleteBuffer(buf)
      gl.deleteProgram(prog)
      gl.deleteShader(vs)
      gl.deleteShader(fs)
    }
  }, [])

  return (
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
      }}
    />
  )
}
