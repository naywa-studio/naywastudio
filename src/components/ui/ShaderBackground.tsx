'use client'

import { useEffect, useRef, useMemo } from 'react'

// ── Pre-compute band keyframes from multi-sinusoidal physics ──────────────
// Runs once at render time; the SMIL animation plays them back smoothly.
// 3 superimposed incommensurate sinusoids → organic, non-mechanical paths.

const N_PTS  = 12   // sample points per edge
const N_KF   = 14   // keyframes over the cycle
const DURATION = 30 // seconds per full cycle

const fv = (v: number) => v.toFixed(4)

function smoothPath(pts: [number, number][]): string {
  const T = 0.45
  let d = `M${fv(pts[0][0])},${fv(pts[0][1])}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[Math.min(pts.length - 1, i + 2)]
    d += ` C${fv(p1[0]+T*(p2[0]-p0[0])/6)},${fv(p1[1]+T*(p2[1]-p0[1])/6)}`
       + ` ${fv(p2[0]-T*(p3[0]-p1[0])/6)},${fv(p2[1]-T*(p3[1]-p1[1])/6)}`
       + ` ${fv(p2[0])},${fv(p2[1])}`
  }
  return d
}

function computeBand(
  baseY: number, thick: number,
  a1: number, k1: number, s1: number, ph1: number,
  a2: number, k2: number, s2: number, ph2: number,
  a3: number, k3: number, s3: number, ph3: number,
  t: number
) {
  const top: [number, number][] = []
  const bot: [number, number][] = []
  for (let i = 0; i <= N_PTS; i++) {
    const x = i / N_PTS
    const wT = a1*Math.sin(k1*x+s1*t+ph1) + a2*Math.sin(k2*x+s2*t+ph2) + a3*Math.sin(k3*x+s3*t+ph3)
    const wB = a1*Math.sin(k1*x+s1*t+ph1+0.35) + a2*Math.sin(k2*x+s2*t+ph2-0.2) + a3*Math.sin(k3*x+s3*t+ph3+0.12)
    top.push([x, baseY + wT])
    bot.push([x, baseY + thick + wB])
  }
  const topSVG = smoothPath(top)
  const botSVG = smoothPath(bot)
  const botRev = smoothPath([...bot].reverse())
  return {
    top:  topSVG,
    bot:  botSVG,
    fill: topSVG + ' ' + botRev.replace(/^M/, 'L') + ' Z',
  }
}

function buildKeyframes() {
  const kfB1 = { fill: [] as string[], top: [] as string[], bot: [] as string[] }
  const kfB2 = { fill: [] as string[], top: [] as string[], bot: [] as string[] }

  for (let f = 0; f < N_KF; f++) {
    const t = (f / N_KF) * DURATION

    const b1 = computeBand(
      0.30, 0.10,
      0.011, 2.7, 0.17, 0.00,
      0.005, 5.3, 0.29, 1.47,
      0.002, 9.1, 0.11, 3.82,
      t
    )
    const b2 = computeBand(
      0.47, 0.083,
      0.010, 3.1, 0.21, 2.09,
      0.004, 6.7, 0.33, 0.78,
      0.0018, 11.2, 0.14, 5.11,
      t
    )

    kfB1.fill.push(b1.fill); kfB1.top.push(b1.top); kfB1.bot.push(b1.bot)
    kfB2.fill.push(b2.fill); kfB2.top.push(b2.top); kfB2.bot.push(b2.bot)
  }

  // Append first frame at end to close the loop seamlessly
  kfB1.fill.push(kfB1.fill[0]); kfB1.top.push(kfB1.top[0]); kfB1.bot.push(kfB1.bot[0])
  kfB2.fill.push(kfB2.fill[0]); kfB2.top.push(kfB2.top[0]); kfB2.bot.push(kfB2.bot[0])

  const keyTimes = Array.from({ length: N_KF + 1 }, (_, i) => (i / N_KF).toFixed(4)).join(';')
  const splines  = Array(N_KF).fill('0.45 0 0.55 1').join(';')

  return { kfB1, kfB2, keyTimes, splines }
}

// Compute once at module level (server + client, deterministic)
const { kfB1, kfB2, keyTimes, splines } = buildKeyframes()

// ── Component ──────────────────────────────────────────────────────────────
export function ShaderBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const gl = canvas.getContext('webgl', {
      antialias: false, alpha: true, premultipliedAlpha: true,
      powerPreference: 'high-performance',
    })
    if (!gl) return

    const vertSrc = `attribute vec2 aPos; void main(){gl_Position=vec4(aPos,0.0,1.0);}`
    const fragSrc = `
      precision highp float;
      uniform vec2 uRes; uniform float uTime,uScroll,uDpr;
      vec3 permute(vec3 x){return mod(((x*34.0)+1.0)*x,289.0);}
      float snoise(vec2 v){
        const vec4 C=vec4(0.211324865405187,0.366025403784439,-0.577350269189626,0.024390243902439);
        vec2 i=floor(v+dot(v,C.yy)),x0=v-i+dot(i,C.xx);
        vec2 i1=(x0.x>x0.y)?vec2(1.0,0.0):vec2(0.0,1.0);
        vec4 x12=x0.xyxy+C.xxzz; x12.xy-=i1; i=mod(i,289.0);
        vec3 p=permute(permute(i.y+vec3(0.0,i1.y,1.0))+i.x+vec3(0.0,i1.x,1.0));
        vec3 m=max(0.5-vec3(dot(x0,x0),dot(x12.xy,x12.xy),dot(x12.zw,x12.zw)),0.0);
        m=m*m; m=m*m;
        vec3 x=2.0*fract(p*C.www)-1.0,h=abs(x)-0.5,ox=floor(x+0.5),a0=x-ox;
        m*=1.79284291400159-0.85373472095314*(a0*a0+h*h);
        vec3 g; g.x=a0.x*x0.x+h.x*x0.y; g.yz=a0.yz*x12.xz+h.yz*x12.yw;
        return 130.0*dot(m,g);
      }
      float fbm(vec2 p){float v=0.0,a=0.5;for(int i=0;i<5;i++){v+=a*snoise(p);p=p*2.02+vec2(1.7,9.2);a*=0.5;}return v;}
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      void main(){
        vec2 uv=gl_FragCoord.xy/uRes, p=uv; p.x*=uRes.x/uRes.y;
        float t=uTime*0.035, sF=uScroll*2.0, sN=uScroll*4.6;
        vec2 qF=vec2(fbm(p*0.9+vec2(0.0,t*0.6+sF*0.35)),fbm(p*0.9+vec2(5.2,-t*0.6+sF*0.35)+1.3));
        float nF=fbm(p+qF*1.2+vec2(0.0,sF))*0.5+0.5;
        vec2 qN=vec2(fbm(p*1.4+vec2(0.0,t+sN*0.6)),fbm(p*1.4+vec2(5.2,-t+sN*0.6)+1.3));
        vec2 rN=vec2(fbm(p*2.0+qN*1.6+vec2(1.7+t,9.2)),fbm(p*2.0+qN*1.6+vec2(8.3,2.8-t)));
        float nN=fbm(p*1.8+rN*1.5+vec2(sN*0.4,sN))*0.5+0.5;
        float n=mix(nF,nN,0.55);
        vec3 mist=vec3(0.965,0.956,0.988),softV=vec3(0.855,0.827,0.949),violet=vec3(0.722,0.682,0.871);
        vec3 col=mix(mist,softV,smoothstep(0.35,0.75,n)*0.85);
        col=mix(col,violet,smoothstep(0.62,0.98,n)*0.55);
        col+=(hash(gl_FragCoord.xy+vec2(uTime*37.0,uTime*53.0))-0.5)*0.022;
        gl_FragColor=vec4(col,1.0);
      }
    `
    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!
      gl.shaderSource(sh, src); gl.compileShader(sh)
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) { console.error(gl.getShaderInfoLog(sh)); return null }
      return sh
    }
    const vs = compile(gl.VERTEX_SHADER, vertSrc)
    const fs = compile(gl.FRAGMENT_SHADER, fragSrc)
    if (!vs || !fs) return
    const prog = gl.createProgram()!
    gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { console.error(gl.getProgramInfoLog(prog)); return }
    gl.useProgram(prog)

    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW)
    const aPos = gl.getAttribLocation(prog, 'aPos')
    gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)

    const uRes=gl.getUniformLocation(prog,'uRes'), uTime=gl.getUniformLocation(prog,'uTime'),
          uScroll=gl.getUniformLocation(prog,'uScroll'), uDpr=gl.getUniformLocation(prog,'uDpr')
    const dpr = Math.min(window.devicePixelRatio||1, 1.75)
    const state = { w:0, h:0, scroll:0 }

    const resize = () => {
      state.w=window.innerWidth; state.h=window.innerHeight
      canvas.width=Math.floor(state.w*dpr); canvas.height=Math.floor(state.h*dpr)
      canvas.style.width=state.w+'px'; canvas.style.height=state.h+'px'
      gl.viewport(0,0,canvas.width,canvas.height)
    }
    const onScroll = () => {
      state.scroll=window.scrollY/Math.max(1,document.documentElement.scrollHeight-state.h)
    }
    resize(); onScroll()
    window.addEventListener('resize', resize)
    window.addEventListener('scroll', onScroll, { passive: true })

    const start = performance.now()
    let raf = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const t = (performance.now()-start)/1000
      gl.uniform2f(uRes,canvas.width,canvas.height)
      gl.uniform1f(uTime,t); gl.uniform1f(uScroll,state.scroll); gl.uniform1f(uDpr,dpr)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      window.removeEventListener('scroll', onScroll)
      gl.deleteBuffer(buf); gl.deleteProgram(prog)
      gl.deleteShader(vs); gl.deleteShader(fs)
    }
  }, [])

  const dur1 = `${DURATION}s`
  const dur2 = `${Math.round(DURATION * 1.4)}s`   // band 2 different tempo

  return (
    <>
      {/* Clip-path — SMIL animates through pre-computed sinusoidal keyframes */}
      <svg aria-hidden width="0" height="0" style={{ position: 'absolute' }}>
        <defs>
          <clipPath id="nawa-bands" clipPathUnits="objectBoundingBox">
            {/* Band 1 fill */}
            <path>
              <animate attributeName="d" dur={dur1} repeatCount="indefinite"
                calcMode="spline" keyTimes={keyTimes} keySplines={splines}
                values={kfB1.fill.join(';')} />
            </path>
            {/* Band 2 fill — different duration → desync */}
            <path>
              <animate attributeName="d" dur={dur2} repeatCount="indefinite"
                calcMode="spline" keyTimes={keyTimes} keySplines={splines}
                values={kfB2.fill.join(';')} />
            </path>
          </clipPath>
        </defs>
      </svg>

      {/* WebGL canvas, clipped to the two organic bands */}
      <canvas
        ref={canvasRef}
        aria-hidden
        style={{
          position:'fixed', inset:0, width:'100%', height:'100%',
          pointerEvents:'none', zIndex:0, clipPath:'url(#nawa-bands)',
        }}
      />

      {/* Border strokes — same sinusoidal keyframes, drawn on top */}
      <svg aria-hidden viewBox="0 0 1 1" preserveAspectRatio="none"
        style={{ position:'fixed', inset:0, width:'100%', height:'100%', pointerEvents:'none', zIndex:1, overflow:'visible' }}>
        {/* Band 1 top edge */}
        <path fill="none" stroke="rgba(184,174,222,0.65)" strokeWidth="1.5" vectorEffect="non-scaling-stroke">
          <animate attributeName="d" dur={dur1} repeatCount="indefinite"
            calcMode="spline" keyTimes={keyTimes} keySplines={splines}
            values={kfB1.top.join(';')} />
        </path>
        {/* Band 1 bottom edge */}
        <path fill="none" stroke="rgba(184,174,222,0.65)" strokeWidth="1.5" vectorEffect="non-scaling-stroke">
          <animate attributeName="d" dur={dur1} repeatCount="indefinite"
            calcMode="spline" keyTimes={keyTimes} keySplines={splines}
            values={kfB1.bot.join(';')} />
        </path>
        {/* Band 2 top edge */}
        <path fill="none" stroke="rgba(184,174,222,0.48)" strokeWidth="1.2" vectorEffect="non-scaling-stroke">
          <animate attributeName="d" dur={dur2} repeatCount="indefinite"
            calcMode="spline" keyTimes={keyTimes} keySplines={splines}
            values={kfB2.top.join(';')} />
        </path>
        {/* Band 2 bottom edge */}
        <path fill="none" stroke="rgba(184,174,222,0.48)" strokeWidth="1.2" vectorEffect="non-scaling-stroke">
          <animate attributeName="d" dur={dur2} repeatCount="indefinite"
            calcMode="spline" keyTimes={keyTimes} keySplines={splines}
            values={kfB2.bot.join(';')} />
        </path>
      </svg>
    </>
  )
}
