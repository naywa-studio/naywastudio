"use client"
import { useEffect, useRef } from "react"

export default function AnimatedBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mouse = useRef({ x: 0, y: 0 })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")!
    let w = canvas.offsetWidth
    let h = canvas.offsetHeight
    canvas.width = w
    canvas.height = h

    const bubbles = Array.from({ length: 38 }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: 40 + Math.random() * 120,
      vx: (Math.random() - 0.5) * 0.25,
      vy: (Math.random() - 0.5) * 0.25,
      color: Math.random() > 0.5
        ? "rgba(224,218,248," : "rgba(238,234,252,",
      opacity: 0.35 + Math.random() * 0.4,
    }))

    const onMouseMove = (e: MouseEvent) => {
      mouse.current.x = (e.clientX / w - 0.5) * 8
      mouse.current.y = (e.clientY / h - 0.5) * 8
    }
    window.addEventListener("mousemove", onMouseMove)

    let animId: number
    const draw = () => {
      animId = requestAnimationFrame(draw)
      ctx.clearRect(0, 0, w, h)
      bubbles.forEach(b => {
        b.x += b.vx + mouse.current.x * 0.01
        b.y += b.vy + mouse.current.y * 0.01
        if (b.x < -b.r) b.x = w + b.r
        if (b.x > w + b.r) b.x = -b.r
        if (b.y < -b.r) b.y = h + b.r
        if (b.y > h + b.r) b.y = -b.r
        const grad = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r)
        grad.addColorStop(0, b.color + b.opacity + ")")
        grad.addColorStop(1, b.color + "0)")
        ctx.beginPath()
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2)
        ctx.fillStyle = grad
        ctx.fill()
      })
    }
    draw()

    const onResize = () => {
      w = canvas.offsetWidth; h = canvas.offsetHeight
      canvas.width = w; canvas.height = h
    }
    window.addEventListener("resize", onResize)
    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener("mousemove", onMouseMove)
      window.removeEventListener("resize", onResize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 0 }}
    />
  )
}
