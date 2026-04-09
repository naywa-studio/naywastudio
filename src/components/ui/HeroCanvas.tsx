'use client'

import { useEffect, useRef } from 'react'

// Brand palette — [R, G, B]
const PALETTE = [
  [124, 99, 200],  // #7C63C8 primary violet
  [184, 174, 222], // #B8AEDE soft violet
  [200, 188, 236], // #C8BCEC light violet
  [255, 255, 255], // white
  [100, 78, 180],  // deep violet
  [160, 143, 219], // mid violet
]

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  r: number
  baseR: number
  opacity: number
  color: number[]
  pulse: number
  pulseSpeed: number
  isNode: boolean
}

export function HeroCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mouse = useRef({ x: -9999, y: -9999 })
  const particles = useRef<Particle[]>([])
  const dims = useRef({ w: 0, h: 0 })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    let animId: number

    const resize = () => {
      const w = canvas.offsetWidth
      const h = canvas.offsetHeight
      canvas.width = w
      canvas.height = h
      dims.current = { w, h }
    }

    const init = () => {
      const { w, h } = dims.current
      const isMobile = w < 768
      const count = isMobile
        ? Math.min(45, Math.floor((w * h) / 18000))
        : Math.min(90, Math.floor((w * h) / 11000))

      particles.current = Array.from({ length: count }, () => {
        const isNode = Math.random() < 0.18
        const color = PALETTE[Math.floor(Math.random() * PALETTE.length)]
        const baseR = isNode ? 2.2 + Math.random() * 2.2 : 0.8 + Math.random() * 1.4
        return {
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.28,
          vy: (Math.random() - 0.5) * 0.28,
          r: baseR,
          baseR,
          opacity: isNode ? 0.55 + Math.random() * 0.45 : 0.18 + Math.random() * 0.38,
          color,
          pulse: Math.random() * Math.PI * 2,
          pulseSpeed: 0.008 + Math.random() * 0.012,
          isNode,
        }
      })
    }

    const draw = () => {
      animId = requestAnimationFrame(draw)
      const { w, h } = dims.current
      const mx = mouse.current.x
      const my = mouse.current.y

      // ── Dark gradient background ──────────────────────────────────────
      const bg = ctx.createLinearGradient(0, 0, w * 0.4, h)
      bg.addColorStop(0, '#050211')
      bg.addColorStop(0.45, '#090420')
      bg.addColorStop(1, '#0e0628')
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, w, h)

      // Subtle radial accent — top right
      const accent = ctx.createRadialGradient(w * 0.78, h * 0.18, 0, w * 0.78, h * 0.18, w * 0.42)
      accent.addColorStop(0, 'rgba(124,99,200,0.09)')
      accent.addColorStop(1, 'rgba(124,99,200,0)')
      ctx.fillStyle = accent
      ctx.fillRect(0, 0, w, h)

      // ── Update particles ──────────────────────────────────────────────
      for (const p of particles.current) {
        // Mouse repulsion
        const dx = p.x - mx
        const dy = p.y - my
        const distSq = dx * dx + dy * dy
        if (distSq < 220 * 220 && distSq > 0) {
          const dist = Math.sqrt(distSq)
          const force = ((220 - dist) / 220) * 0.9
          p.vx += (dx / dist) * force * 0.025
          p.vy += (dy / dist) * force * 0.025
        }

        // Dampen + cap speed
        p.vx *= 0.975
        p.vy *= 0.975
        const spd = Math.sqrt(p.vx * p.vx + p.vy * p.vy)
        if (spd > 0.9) { p.vx = (p.vx / spd) * 0.9; p.vy = (p.vy / spd) * 0.9 }

        p.x += p.vx
        p.y += p.vy

        // Wraparound
        if (p.x < -12) p.x = w + 12
        if (p.x > w + 12) p.x = -12
        if (p.y < -12) p.y = h + 12
        if (p.y > h + 12) p.y = -12

        // Pulse
        p.pulse += p.pulseSpeed
        p.r = p.baseR + Math.sin(p.pulse) * p.baseR * 0.28
      }

      // ── Draw connections ──────────────────────────────────────────────
      const MAX_CONN = 170
      const pts = particles.current
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const a = pts[i], b = pts[j]
          const dx = a.x - b.x, dy = a.y - b.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < MAX_CONN) {
            const t = 1 - dist / MAX_CONN
            // Brighter line when at least one is a node
            const alpha = t * (a.isNode || b.isNode ? 0.28 : 0.14)
            ctx.beginPath()
            ctx.moveTo(a.x, a.y)
            ctx.lineTo(b.x, b.y)
            ctx.strokeStyle = `rgba(124,99,200,${alpha})`
            ctx.lineWidth = a.isNode || b.isNode ? 0.7 : 0.4
            ctx.stroke()
          }
        }
      }

      // ── Draw particles ────────────────────────────────────────────────
      for (const p of particles.current) {
        const [r, g, b] = p.color

        if (p.isNode) {
          // Soft glow halo
          const halo = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 5)
          halo.addColorStop(0, `rgba(${r},${g},${b},${p.opacity * 0.38})`)
          halo.addColorStop(0.4, `rgba(${r},${g},${b},${p.opacity * 0.12})`)
          halo.addColorStop(1, `rgba(${r},${g},${b},0)`)
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.r * 5, 0, Math.PI * 2)
          ctx.fillStyle = halo
          ctx.fill()
        }

        // Core dot
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${r},${g},${b},${p.opacity})`
        ctx.fill()
      }
    }

    const onMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      mouse.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    }
    const onMouseLeave = () => { mouse.current = { x: -9999, y: -9999 } }
    const onResize = () => { resize(); init() }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('resize', onResize)
    canvas.addEventListener('mouseleave', onMouseLeave)

    resize()
    init()
    draw()

    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('resize', onResize)
      canvas.removeEventListener('mouseleave', onMouseLeave)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        display: 'block',
        pointerEvents: 'none',
      }}
    />
  )
}
