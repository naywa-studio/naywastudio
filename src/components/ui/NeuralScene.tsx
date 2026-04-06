'use client'

import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

const COUNT = 300
const SPHERE_RADIUS = 2.2
const LINE_THRESHOLD = 0.88
const MOUSE_LERP = 0.045

// ── Pre-compute three target formations ──────────────────────────────────────

function buildSpherePositions(): Float32Array {
  const out = new Float32Array(COUNT * 3)
  for (let i = 0; i < COUNT; i++) {
    const phi   = Math.acos(-1 + (2 * i) / COUNT)
    const theta = Math.sqrt(COUNT * Math.PI) * phi
    out[i * 3]     = SPHERE_RADIUS * Math.sin(phi) * Math.cos(theta)
    out[i * 3 + 1] = SPHERE_RADIUS * Math.sin(phi) * Math.sin(theta)
    out[i * 3 + 2] = SPHERE_RADIUS * Math.cos(phi)
  }
  return out
}

function buildGridPositions(): Float32Array {
  const out = new Float32Array(COUNT * 3)
  const COLS = 20
  for (let i = 0; i < COUNT; i++) {
    const col = i % COLS
    const row = Math.floor(i / COLS)
    out[i * 3]     = (col - COLS / 2 + 0.5) * 0.38
    out[i * 3 + 1] = (row - (COUNT / COLS) / 2 + 0.5) * 0.38
    out[i * 3 + 2] = 0
  }
  return out
}

function buildSpiralPositions(): Float32Array {
  const out = new Float32Array(COUNT * 3)
  for (let i = 0; i < COUNT; i++) {
    const t     = i / COUNT
    const angle = t * Math.PI * 16
    const r     = t * 2.4
    const height = (t - 0.5) * 4
    out[i * 3]     = Math.cos(angle) * r
    out[i * 3 + 1] = height
    out[i * 3 + 2] = Math.sin(angle) * r
  }
  return out
}

// ── Static line pairs based on sphere proximity ───────────────────────────────
function buildLinePairs(sphere: Float32Array): number[] {
  const pairs: number[] = []
  for (let i = 0; i < COUNT; i++) {
    for (let j = i + 1; j < COUNT; j++) {
      const dx = sphere[i * 3]     - sphere[j * 3]
      const dy = sphere[i * 3 + 1] - sphere[j * 3 + 1]
      const dz = sphere[i * 3 + 2] - sphere[j * 3 + 2]
      if (dx * dx + dy * dy + dz * dz < LINE_THRESHOLD * LINE_THRESHOLD) {
        pairs.push(i, j)
      }
    }
  }
  return pairs
}

export default function NeuralScene() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    // ── Renderer ──────────────────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(window.innerWidth, window.innerHeight)
    renderer.setClearColor(0x000000, 0)

    const scene  = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100)
    camera.position.z = 5.5

    // ── Target formations ─────────────────────────────────────────────────────
    const spherePos = buildSpherePositions()
    const gridPos   = buildGridPositions()
    const spiralPos = buildSpiralPositions()

    // ── Particle geometry ─────────────────────────────────────────────────────
    const positions = new Float32Array(spherePos)          // current (mutable)
    const pGeo = new THREE.BufferGeometry()
    pGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3))

    const pMat = new THREE.PointsMaterial({
      size: 0.045,
      color: 0x4499ff,
      transparent: true,
      opacity: 0.9,
      sizeAttenuation: true,
      depthWrite: false,
    })
    const points = new THREE.Points(pGeo, pMat)
    scene.add(points)

    // ── Connection lines (pre-baked, follow sphere rotation) ──────────────────
    const pairs = buildLinePairs(spherePos)
    const lineVerts = new Float32Array(pairs.length * 3)      // 2 verts per pair

    // Initial fill from sphere positions
    for (let p = 0; p < pairs.length / 2; p++) {
      const a = pairs[p * 2]
      const b = pairs[p * 2 + 1]
      lineVerts[p * 6]     = spherePos[a * 3]
      lineVerts[p * 6 + 1] = spherePos[a * 3 + 1]
      lineVerts[p * 6 + 2] = spherePos[a * 3 + 2]
      lineVerts[p * 6 + 3] = spherePos[b * 3]
      lineVerts[p * 6 + 4] = spherePos[b * 3 + 1]
      lineVerts[p * 6 + 5] = spherePos[b * 3 + 2]
    }

    const lGeo = new THREE.BufferGeometry()
    lGeo.setAttribute('position', new THREE.BufferAttribute(lineVerts, 3))

    const lMat = new THREE.LineBasicMaterial({
      color: 0x0066ff,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
    })
    const lineSegs = new THREE.LineSegments(lGeo, lMat)
    scene.add(lineSegs)

    // ── Pulse orb at centre ───────────────────────────────────────────────────
    const orbGeo = new THREE.SphereGeometry(0.08, 16, 16)
    const orbMat = new THREE.MeshBasicMaterial({ color: 0x0066ff, transparent: true, opacity: 0.6 })
    const orb = new THREE.Mesh(orbGeo, orbMat)
    scene.add(orb)
    gsap.to(orbMat, { opacity: 0.05, duration: 1.6, yoyo: true, repeat: -1, ease: 'sine.inOut' })

    // ── Scroll morphing ───────────────────────────────────────────────────────
    const scroll = { value: 0 }

    // Phase 0→0.5  : sphere → spiral
    // Phase 0.5→1  : spiral → grid
    ScrollTrigger.create({
      trigger: document.body,
      start: 'top top',
      end: '40% top',
      scrub: 1.8,
      onUpdate: (self) => { scroll.value = self.progress },
    })

    // ── Mouse parallax ────────────────────────────────────────────────────────
    const mouse = { tx: 0, ty: 0, x: 0, y: 0 }
    const onMouse = (e: MouseEvent) => {
      mouse.tx = (e.clientX / window.innerWidth  - 0.5) * 2
      mouse.ty = -(e.clientY / window.innerHeight - 0.5) * 2
    }
    window.addEventListener('mousemove', onMouse, { passive: true })

    // ── Resize ────────────────────────────────────────────────────────────────
    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight
      camera.updateProjectionMatrix()
      renderer.setSize(window.innerWidth, window.innerHeight)
    }
    window.addEventListener('resize', onResize, { passive: true })

    // ── Animation loop ────────────────────────────────────────────────────────
    const clock  = new THREE.Clock()
    let rafId: number

    // "Breathing" scale offset
    const breathScale = { v: 1 }
    gsap.to(breathScale, { v: 1.04, duration: 2.8, yoyo: true, repeat: -1, ease: 'sine.inOut' })

    const animate = () => {
      rafId = requestAnimationFrame(animate)
      const t = clock.getElapsedTime()

      // Smooth mouse
      mouse.x += (mouse.tx - mouse.x) * MOUSE_LERP
      mouse.y += (mouse.ty - mouse.y) * MOUSE_LERP

      // Phase split: 0–0.5 → sphere↔spiral, 0.5–1 → spiral↔grid
      const sv = scroll.value
      let fromPos: Float32Array
      let toPos: Float32Array
      let phase: number
      if (sv < 0.5) {
        fromPos = spherePos; toPos = spiralPos; phase = sv * 2
      } else {
        fromPos = spiralPos; toPos = gridPos;   phase = (sv - 0.5) * 2
      }

      // Lerp particle positions
      const pos = pGeo.attributes.position.array as Float32Array
      for (let i = 0; i < COUNT; i++) {
        const fi = i * 3
        pos[fi]     = THREE.MathUtils.lerp(fromPos[fi],     toPos[fi],     phase)
        pos[fi + 1] = THREE.MathUtils.lerp(fromPos[fi + 1], toPos[fi + 1], phase)
        pos[fi + 2] = THREE.MathUtils.lerp(fromPos[fi + 2], toPos[fi + 2], phase)
      }
      pGeo.attributes.position.needsUpdate = true

      // Update line endpoints to match morphed particles
      const lv = lGeo.attributes.position.array as Float32Array
      for (let p = 0; p < pairs.length / 2; p++) {
        const a = pairs[p * 2]
        const b = pairs[p * 2 + 1]
        lv[p * 6]     = pos[a * 3];      lv[p * 6 + 1] = pos[a * 3 + 1]; lv[p * 6 + 2] = pos[a * 3 + 2]
        lv[p * 6 + 3] = pos[b * 3];      lv[p * 6 + 4] = pos[b * 3 + 1]; lv[p * 6 + 5] = pos[b * 3 + 2]
      }
      lGeo.attributes.position.needsUpdate = true

      // Fade lines out as we morph away from sphere
      lMat.opacity = 0.12 * (1 - Math.min(sv * 3, 1))

      // Group rotation: slow auto-spin + mouse parallax
      const rotY = t * 0.07 + mouse.x * 0.35
      const rotX = Math.sin(t * 0.04) * 0.15 + mouse.y * 0.25

      points.rotation.y   = rotY
      points.rotation.x   = rotX
      lineSegs.rotation.y = rotY
      lineSegs.rotation.x = rotX

      // Breathing only active on sphere phase
      const breathFactor = 1 + (breathScale.v - 1) * Math.max(0, 1 - sv * 4)
      points.scale.setScalar(breathFactor)
      lineSegs.scale.setScalar(breathFactor)

      renderer.render(scene, camera)
    }
    animate()

    // ── Cleanup ───────────────────────────────────────────────────────────────
    return () => {
      cancelAnimationFrame(rafId)
      window.removeEventListener('mousemove', onMouse)
      window.removeEventListener('resize', onResize)
      ScrollTrigger.getAll().forEach((st) => st.kill())
      pGeo.dispose(); pMat.dispose()
      lGeo.dispose(); lMat.dispose()
      orbGeo.dispose(); orbMat.dispose()
      renderer.dispose()
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="fixed inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 0 }}
    />
  )
}
