"use client"
import { useEffect, useRef } from "react"
import * as THREE from "three"

export default function ThreeDesktopScene() {
  const mountRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    const isMobile = window.innerWidth < 768
    let w = mount.clientWidth
    let h = mount.clientHeight
    if (w === 0 || h === 0) return

    // ── Renderer ──────────────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: !isMobile, alpha: true })
    renderer.setSize(w, h)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2))
    renderer.setClearColor(0x000000, 0)
    mount.appendChild(renderer.domElement)

    // ── Scene & Camera ────────────────────────────────────────────────────
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(30, w / h, 0.1, 100)
    camera.position.set(8, 8, 10)
    camera.lookAt(0, 0.5, 0)

    // ── Lighting ──────────────────────────────────────────────────────────
    scene.add(new THREE.AmbientLight(0xffffff, 0.85))

    const keyLight = new THREE.DirectionalLight(0xffffff, 0.6)
    keyLight.position.set(8, 12, 6)
    scene.add(keyLight)

    const fillLight = new THREE.DirectionalLight(0x7c63c8, 0.3)
    fillLight.position.set(-6, 4, -4)
    scene.add(fillLight)

    // ── Material & Geometry helpers ───────────────────────────────────────
    type PhongOpts = { flat?: boolean; emissive?: number; emissiveI?: number }
    const phong = (color: number, opts: PhongOpts = {}) =>
      new THREE.MeshPhongMaterial({
        color,
        flatShading: opts.flat ?? false,
        emissive: opts.emissive ?? 0x000000,
        emissiveIntensity: opts.emissiveI ?? 0,
        shininess: 15,
      })

    const bx  = (bw: number, bh: number, bd: number) => new THREE.BoxGeometry(bw, bh, bd)
    const cyl = (rt: number, rb: number, ch: number, seg = 8) => new THREE.CylinderGeometry(rt, rb, ch, seg)
    const sph = (r: number, ws = 6, hs = 4) => new THREE.SphereGeometry(r, ws, hs)
    const mk  = (geo: THREE.BufferGeometry, mat: THREE.Material) => new THREE.Mesh(geo, mat)

    // ── Main root group (for mouse parallax) ─────────────────────────────
    const root = new THREE.Group()
    scene.add(root)

    // ── Desk group ────────────────────────────────────────────────────────
    const deskGrp = new THREE.Group()
    root.add(deskGrp)

    // Surface
    deskGrp.add(mk(bx(4.2, 0.12, 2.6), phong(0xf2edf9)))

    // Legs (4 corners)
    ;([ [-1.9, -1.1], [1.9, -1.1], [-1.9, 1.1], [1.9, 1.1] ] as [number, number][]).forEach(([x, z]) => {
      const leg = mk(bx(0.12, 1.2, 0.12), phong(0xddd6f5))
      leg.position.set(x, -0.66, z)
      deskGrp.add(leg)
    })

    // ── Monitor ───────────────────────────────────────────────────────────
    const monGrp = new THREE.Group()
    monGrp.position.set(-0.2, 0.06, -0.5)
    deskGrp.add(monGrp)

    // Base plate
    monGrp.add(Object.assign(mk(bx(0.85, 0.06, 0.45), phong(0xcec7ee)), { position: new THREE.Vector3(0, 0, 0) }))

    // Stand
    const monStand = mk(bx(0.1, 0.5, 0.1), phong(0xbdb6e8))
    monStand.position.y = 0.28
    monGrp.add(monStand)

    // Frame (purple)
    const monFrame = mk(bx(2.0, 1.35, 0.1), phong(0x7c63c8))
    monFrame.position.y = 1.08
    monGrp.add(monFrame)

    // Screen (dark with emissive glow)
    const monScreen = mk(
      bx(1.82, 1.18, 0.06),
      phong(0x0d0a1f, { emissive: 0x1a1060, emissiveI: 0.8 })
    )
    monScreen.position.set(0, 1.08, 0.05)
    monGrp.add(monScreen)

    // Terminal lines on screen
    const termLines: [number, number, number, number][] = [
      [0x7c63c8, 0.60, -0.45, 1.21],
      [0x4caf50, 0.90, -0.25, 1.08],
      [0xb8aede, 0.45, -0.50, 0.95],
      [0x7c63c8, 0.70, -0.30, 0.82],
      [0x4caf50, 0.50, -0.40, 0.69],
    ]
    termLines.forEach(([color, lw, lx, ly]) => {
      const line = mk(bx(lw, 0.04, 0.01), new THREE.MeshBasicMaterial({ color }))
      line.position.set(lx, ly, 0.09)
      monGrp.add(line)
    })

    // ── Keyboard ──────────────────────────────────────────────────────────
    const kbGrp = new THREE.Group()
    kbGrp.position.set(-0.1, 0.095, 0.35)
    deskGrp.add(kbGrp)

    kbGrp.add(mk(bx(1.65, 0.07, 0.55), phong(0xeae4f8)))

    // Subtle key row strips
    ;[-0.15, 0, 0.15].forEach(zOff => {
      const strip = mk(bx(1.45, 0.02, 0.08), phong(0xd8d0f0))
      strip.position.set(0, 0.045, zOff)
      kbGrp.add(strip)
    })

    // ── Mouse ─────────────────────────────────────────────────────────────
    const mouseGrp = new THREE.Group()
    mouseGrp.position.set(1.0, 0.09, 0.45)
    deskGrp.add(mouseGrp)

    mouseGrp.add(mk(bx(0.24, 0.1, 0.38), phong(0xd8d2f0)))

    const mouseLine = mk(bx(0.01, 0.05, 0.18), phong(0xbfb8e0))
    mouseLine.position.set(0, 0.07, -0.06)
    mouseGrp.add(mouseLine)

    // ── Lamp ──────────────────────────────────────────────────────────────
    const lampGrp = new THREE.Group()
    lampGrp.position.set(-1.7, 0.06, -0.85)
    deskGrp.add(lampGrp)

    lampGrp.add(mk(cyl(0.2, 0.25, 0.08, 6), phong(0x7c63c8, { flat: true })))

    // Arm section 1 (lower, slightly angled)
    const arm1 = new THREE.Group()
    arm1.position.set(0, 0.04, 0)
    arm1.rotation.z = -0.18
    lampGrp.add(arm1)

    const armSeg1 = mk(bx(0.07, 0.72, 0.07), phong(0x9b87d8))
    armSeg1.position.y = 0.36
    arm1.add(armSeg1)

    // Arm section 2 (upper, counter-angled)
    const arm2 = new THREE.Group()
    arm2.position.set(0, 0.72, 0)
    arm2.rotation.z = 0.35
    arm1.add(arm2)

    const armSeg2 = mk(bx(0.07, 0.5, 0.07), phong(0x9b87d8))
    armSeg2.position.y = 0.25
    arm2.add(armSeg2)

    // Shade
    const shade = mk(cyl(0.28, 0.13, 0.22, 6), phong(0x7c63c8, { flat: true }))
    shade.position.y = 0.5
    shade.rotation.z = Math.PI * 0.12
    arm2.add(shade)

    // Warm point light from lamp
    const lampPt = new THREE.PointLight(0xffdda0, 0.8, 3.5)
    lampPt.position.y = 0.32
    arm2.add(lampPt)

    // ── Plant ─────────────────────────────────────────────────────────────
    const plantGrp = new THREE.Group()
    plantGrp.position.set(1.7, 0.06, -0.85)
    deskGrp.add(plantGrp)

    const pot = mk(cyl(0.24, 0.19, 0.38, 6), phong(0xc27050, { flat: true }))
    pot.position.y = 0.19
    plantGrp.add(pot)

    const soil = mk(cyl(0.23, 0.23, 0.04, 6), phong(0x5c3318, { flat: true }))
    soil.position.y = 0.4
    plantGrp.add(soil)

    // Three overlapping leaf spheres for a bushy look
    const leafMat = phong(0x4a9a5a, { flat: true })
    ;([[0, 0.82, 0, 0.28], [-0.13, 0.71, 0.08, 0.20], [0.13, 0.71, -0.07, 0.20]] as [number, number, number, number][])
      .forEach(([px, py, pz, r]) => {
        const leaf = mk(sph(r, 5, 4), leafMat)
        leaf.position.set(px, py, pz)
        plantGrp.add(leaf)
      })

    // ── Mug ───────────────────────────────────────────────────────────────
    const mugGrp = new THREE.Group()
    mugGrp.position.set(1.3, 0.06, 0.25)
    deskGrp.add(mugGrp)

    const mugBody = mk(cyl(0.185, 0.165, 0.30, 8), phong(0xffffff))
    mugBody.position.y = 0.15
    mugGrp.add(mugBody)

    const mugBand = mk(cyl(0.190, 0.170, 0.07, 8), phong(0x7c63c8))
    mugBand.position.y = 0.08
    mugGrp.add(mugBand)

    const coffeeSurface = mk(cyl(0.17, 0.17, 0.02, 8), phong(0x5c2c0e))
    coffeeSurface.position.y = 0.31
    mugGrp.add(coffeeSurface)

    const handle = mk(
      new THREE.TorusGeometry(0.10, 0.025, 4, 8, Math.PI),
      phong(0xebe6f8)
    )
    handle.position.set(0.22, 0.15, 0)
    handle.rotation.y = Math.PI / 2
    handle.rotation.z = Math.PI / 2
    mugGrp.add(handle)

    // ── Sticky notes ──────────────────────────────────────────────────────
    const notesGrp = new THREE.Group()
    notesGrp.position.set(-1.1, 0.065, 0.62)
    deskGrp.add(notesGrp)

    ;([[0xfff9c4, 0, 0], [0xffcdd2, 0.009, 0.1], [0xe8eaf6, 0.018, -0.08]] as [number, number, number][])
      .forEach(([color, dy, ry]) => {
        const note = mk(bx(0.32, 0.01, 0.32), phong(color))
        note.position.y = dy
        note.rotation.y = ry
        notesGrp.add(note)
      })

    // ── Tracking state ────────────────────────────────────────────────────
    let scrollProg  = 0, targetScroll = 0
    let mx = 0, my = 0, tmx = 0, tmy = 0

    const onScroll = () => {
      targetScroll = Math.min(window.scrollY / (window.innerHeight * 0.7), 1)
    }
    const onMouse = (e: MouseEvent) => {
      tmx = (e.clientX / window.innerWidth  - 0.5) * 2
      tmy = (e.clientY / window.innerHeight - 0.5) * 2
    }

    window.addEventListener("scroll",    onScroll, { passive: true })
    if (!isMobile) window.addEventListener("mousemove", onMouse, { passive: true })

    // ── Per-object levitation config ──────────────────────────────────────
    type Floater = { obj: THREE.Group; baseY: number; sf: number; ph: number; ia: number }
    const floaters: Floater[] = [
      { obj: monGrp,   baseY: monGrp.position.y,   sf: 1.2, ph: 0.0, ia: 0.040 },
      { obj: kbGrp,    baseY: kbGrp.position.y,    sf: 0.7, ph: 0.8, ia: 0.025 },
      { obj: mouseGrp, baseY: mouseGrp.position.y, sf: 0.5, ph: 1.5, ia: 0.020 },
      { obj: lampGrp,  baseY: lampGrp.position.y,  sf: 1.3, ph: 2.0, ia: 0.050 },
      { obj: plantGrp, baseY: plantGrp.position.y, sf: 1.0, ph: 1.2, ia: 0.030 },
      { obj: mugGrp,   baseY: mugGrp.position.y,   sf: 0.6, ph: 0.5, ia: 0.025 },
      { obj: notesGrp, baseY: notesGrp.position.y, sf: 0.4, ph: 1.8, ia: 0.020 },
    ]

    // ── Resize ────────────────────────────────────────────────────────────
    const onResize = () => {
      w = mount.clientWidth
      h = mount.clientHeight
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }
    window.addEventListener("resize", onResize)

    // ── Animation loop ────────────────────────────────────────────────────
    let raf: number
    const clock = new THREE.Clock()

    const tick = () => {
      raf = requestAnimationFrame(tick)
      const t = clock.getElapsedTime()

      // Smooth lerp toward targets
      scrollProg += (targetScroll - scrollProg) * 0.04
      mx += (tmx - mx) * 0.05
      my += (tmy - my) * 0.05

      // Root: subtle mouse parallax rotation
      root.rotation.y =  mx * 0.07
      root.rotation.x =  my * 0.03

      // Desk: gentle idle + scroll levitation
      deskGrp.position.y = Math.sin(t * 0.35) * 0.015 + scrollProg * 1.4

      // Individual objects: additional levitation off desk surface + idle oscillation
      floaters.forEach(({ obj, baseY, sf, ph, ia }) => {
        obj.position.y = baseY + scrollProg * 0.8 * sf + Math.sin(t * 0.45 + ph) * ia
      })

      renderer.render(scene, camera)
    }
    tick()

    // ── Cleanup ───────────────────────────────────────────────────────────
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener("scroll",    onScroll)
      window.removeEventListener("mousemove", onMouse)
      window.removeEventListener("resize",    onResize)
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement)
      }
      renderer.dispose()
    }
  }, [])

  return (
    <div
      ref={mountRef}
      aria-hidden="true"
      className="absolute top-0 bottom-0 right-0 left-0 md:left-auto w-full md:w-[62%] pointer-events-none"
      style={{ zIndex: 0 }}
    />
  )
}
