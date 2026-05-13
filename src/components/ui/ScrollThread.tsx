'use client'

import { useEffect, useRef } from 'react'

// Waypoints as [xPercent, yPercent] across the full page height
// x: 0–100 = left–right of viewport, y: 0–100 = top–bottom of full document
const WAYPOINTS: [number, number][] = [
  [50,  0],
  [18,  8],
  [78, 17],
  [20, 26],
  [76, 35],
  [22, 44],
  [74, 53],
  [20, 62],
  [72, 71],
  [26, 80],
  [68, 89],
  [50, 100],
]

const STEPS = 60 // points per segment

/** Catmull-Rom spline interpolation through all waypoints */
function buildPath(pts: [number, number][]): [number, number][] {
  const result: [number, number][] = []
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[Math.min(pts.length - 1, i + 2)]
    for (let s = 0; s < STEPS; s++) {
      const t  = s / STEPS
      const t2 = t * t
      const t3 = t2 * t
      const x = 0.5 * (
        2 * p1[0] +
        (-p0[0] + p2[0]) * t +
        (2*p0[0] - 5*p1[0] + 4*p2[0] - p3[0]) * t2 +
        (-p0[0] + 3*p1[0] - 3*p2[0] + p3[0]) * t3
      )
      const y = 0.5 * (
        2 * p1[1] +
        (-p0[1] + p2[1]) * t +
        (2*p0[1] - 5*p1[1] + 4*p2[1] - p3[1]) * t2 +
        (-p0[1] + 3*p1[1] - 3*p2[1] + p3[1]) * t3
      )
      result.push([x, y])
    }
  }
  result.push(pts[pts.length - 1])
  return result
}

export function ScrollThread() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const scrollYRef = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    let animId: number
    let vw = 0
    let vh = 0

    const resize = () => {
      vw = window.innerWidth
      vh = window.innerHeight
      canvas.width  = vw
      canvas.height = vh
    }

    const onScroll = () => { scrollYRef.current = window.scrollY }

    // Build spline once (in page-% space)
    const pathPct = buildPath(WAYPOINTS)
    const totalPts = pathPct.length

    const draw = (time: number) => {
      animId = requestAnimationFrame(draw)
      ctx.clearRect(0, 0, vw, vh)

      const docH    = document.documentElement.scrollHeight
      const maxScroll = Math.max(1, docH - vh)
      const scrollY = scrollYRef.current
      const rawProgress = scrollY / maxScroll          // 0 → 1

      // Always show a small initial segment before user scrolls
      const progress = Math.max(0.04, rawProgress)
      const headCount = Math.min(totalPts - 1, Math.floor(progress * totalPts * 1.08))

      if (headCount < 2) { animId = requestAnimationFrame(draw); return }

      // Convert page-% point → current viewport pixels
      const toVP = (pt: [number, number]) => ({
        x: (pt[0] / 100) * vw,
        y: (pt[1] / 100) * docH - scrollY,
      })

      // ── Faint full-trail (all revealed) ──────────────────────────────
      ctx.beginPath()
      const first = toVP(pathPct[0])
      ctx.moveTo(first.x, first.y)
      for (let i = 1; i <= headCount; i++) {
        const v = toVP(pathPct[i])
        ctx.lineTo(v.x, v.y)
      }
      ctx.strokeStyle = 'rgba(124,99,200,0.13)'
      ctx.lineWidth   = 1.2
      ctx.lineCap     = 'round'
      ctx.lineJoin    = 'round'
      ctx.stroke()

      // ── Brighter recent trail (last 22% of revealed) ─────────────────
      const tailStart = Math.max(0, headCount - Math.floor(totalPts * 0.22))
      if (headCount - tailStart > 1) {
        ctx.beginPath()
        const sv = toVP(pathPct[tailStart])
        ctx.moveTo(sv.x, sv.y)
        for (let i = tailStart + 1; i <= headCount; i++) {
          const v = toVP(pathPct[i])
          ctx.lineTo(v.x, v.y)
        }
        ctx.strokeStyle = 'rgba(124,99,200,0.38)'
        ctx.lineWidth   = 1.5
        ctx.stroke()
      }

      // ── Glowing head dot ─────────────────────────────────────────────
      const head = toVP(pathPct[headCount])
      const pulse = Math.sin(time * 0.0022) * 0.3 + 0.7

      // Outer aura
      const aura = ctx.createRadialGradient(head.x, head.y, 0, head.x, head.y, 24)
      aura.addColorStop(0, `rgba(124,99,200,${0.22 * pulse})`)
      aura.addColorStop(1, 'rgba(124,99,200,0)')
      ctx.beginPath()
      ctx.arc(head.x, head.y, 24, 0, Math.PI * 2)
      ctx.fillStyle = aura
      ctx.fill()

      // Core ring
      ctx.beginPath()
      ctx.arc(head.x, head.y, 4.5, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(124,99,200,${0.7 * pulse})`
      ctx.fill()

      // Inner bright core
      ctx.beginPath()
      ctx.arc(head.x, head.y, 2, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(200,188,236,${pulse})`
      ctx.fill()

      // ── Waypoint markers (appear when thread passes them) ─────────────
      WAYPOINTS.forEach(([wx, wy], idx) => {
        if (idx === 0) return
        const wpProgress = idx / (WAYPOINTS.length - 1)
        if (wpProgress > rawProgress + 0.03) return
        const age = Math.min(1, (rawProgress + 0.03 - wpProgress) / 0.04)
        const vp = { x: (wx / 100) * vw, y: (wy / 100) * docH - scrollY }
        if (vp.y < -10 || vp.y > vh + 10) return

        ctx.beginPath()
        ctx.arc(vp.x, vp.y, 2.5, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(124,99,200,${0.3 * age})`
        ctx.fill()
      })
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', resize)

    resize()
    onScroll()
    animId = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', resize)
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
        zIndex:        20,
        mixBlendMode:  'multiply',
      }}
    />
  )
}
