'use client'

import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { cn } from '@/lib/utils'

interface ThreeSceneProps {
  className?: string
}

export function ThreeScene({ className }: ThreeSceneProps) {
  const mountRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    // ── Renderer ──────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
    })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(mount.clientWidth, mount.clientHeight)
    renderer.setClearColor(0x000000, 0)
    mount.appendChild(renderer.domElement)

    // ── Scene & Camera ────────────────────────────────────────
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(
      50,
      mount.clientWidth / mount.clientHeight,
      0.1,
      100,
    )
    camera.position.set(0, 0, 5)

    // ── Holographic sphere ────────────────────────────────────
    const sphereGeo = new THREE.IcosahedronGeometry(1.4, 6)
    const sphereMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime:        { value: 0 },
        uColor1:      { value: new THREE.Color('#0066FF') },
        uColor2:      { value: new THREE.Color('#7C3AED') },
        uMouseX:      { value: 0 },
        uMouseY:      { value: 0 },
      },
      vertexShader: /* glsl */`
        uniform float uTime;
        uniform float uMouseX;
        uniform float uMouseY;
        varying vec3  vNormal;
        varying float vNoise;

        // Simple value noise
        float hash(vec3 p) {
          p = fract(p * vec3(443.8975, 397.2973, 491.1871));
          p += dot(p, p.yxz + 19.19);
          return fract((p.x + p.y) * p.z);
        }

        float noise(vec3 p) {
          vec3 i = floor(p);
          vec3 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(mix(hash(i),             hash(i+vec3(1,0,0)), f.x),
                mix(hash(i+vec3(0,1,0)), hash(i+vec3(1,1,0)), f.x), f.y),
            mix(mix(hash(i+vec3(0,0,1)), hash(i+vec3(1,0,1)), f.x),
                mix(hash(i+vec3(0,1,1)), hash(i+vec3(1,1,1)), f.x), f.y),
            f.z
          );
        }

        void main() {
          vNormal = normal;
          float n = noise(position * 1.8 + uTime * 0.3) * 0.18;
          n += noise(position * 3.5 + uTime * 0.15) * 0.08;
          vNoise = n;

          vec3 pos = position + normal * n;

          // subtle mouse tilt
          float rx = uMouseY * 0.4;
          float ry = uMouseX * 0.4;
          float cosX = cos(rx), sinX = sin(rx);
          float cosY = cos(ry), sinY = sin(ry);
          pos = vec3(
            cosY * pos.x + sinY * pos.z,
            pos.y,
            -sinY * pos.x + cosY * pos.z
          );
          pos = vec3(
            pos.x,
            cosX * pos.y - sinX * pos.z,
            sinX * pos.y + cosX * pos.z
          );

          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: /* glsl */`
        uniform vec3  uColor1;
        uniform vec3  uColor2;
        uniform float uTime;
        varying vec3  vNormal;
        varying float vNoise;

        void main() {
          vec3 viewDir = normalize(vec3(0.0, 0.0, 1.0));
          float fresnel = pow(1.0 - abs(dot(vNormal, viewDir)), 2.5);

          float t = sin(uTime * 0.4 + vNoise * 8.0) * 0.5 + 0.5;
          vec3 color = mix(uColor1, uColor2, t + vNoise * 2.0);
          color = mix(color, vec3(0.9, 0.95, 1.0), fresnel * 0.6);

          float alpha = 0.55 + fresnel * 0.45;
          gl_FragColor = vec4(color, alpha);
        }
      `,
      transparent: true,
      side: THREE.FrontSide,
    })
    const sphere = new THREE.Mesh(sphereGeo, sphereMat)
    scene.add(sphere)

    // Wireframe overlay
    const wireGeo  = new THREE.IcosahedronGeometry(1.41, 3)
    const wireMat  = new THREE.MeshBasicMaterial({
      color: 0x0066ff,
      wireframe: true,
      transparent: true,
      opacity: 0.06,
    })
    scene.add(new THREE.Mesh(wireGeo, wireMat))

    // ── Outer ring ────────────────────────────────────────────
    const ringGeo = new THREE.TorusGeometry(2.0, 0.006, 2, 128)
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x0066ff,
      transparent: true,
      opacity: 0.25,
    })
    const ring = new THREE.Mesh(ringGeo, ringMat)
    ring.rotation.x = Math.PI / 4
    scene.add(ring)

    const ring2 = new THREE.Mesh(
      new THREE.TorusGeometry(2.3, 0.004, 2, 128),
      new THREE.MeshBasicMaterial({ color: 0x7c3aed, transparent: true, opacity: 0.15 }),
    )
    ring2.rotation.x = -Math.PI / 3
    ring2.rotation.z = Math.PI / 5
    scene.add(ring2)

    // ── Particles ─────────────────────────────────────────────
    const PARTICLE_COUNT = 200
    const pPositions = new Float32Array(PARTICLE_COUNT * 3)
    const pColors    = new Float32Array(PARTICLE_COUNT * 3)
    const pSizes     = new Float32Array(PARTICLE_COUNT)
    const pAngles    = new Float32Array(PARTICLE_COUNT)
    const pRadii     = new Float32Array(PARTICLE_COUNT)
    const pSpeeds    = new Float32Array(PARTICLE_COUNT)
    const pInclination = new Float32Array(PARTICLE_COUNT)

    const c1 = new THREE.Color('#0066FF')
    const c2 = new THREE.Color('#7C3AED')
    const cM = new THREE.Color('#60A5FA')

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      pAngles[i]      = Math.random() * Math.PI * 2
      pRadii[i]       = 1.9 + Math.random() * 1.4
      pSpeeds[i]      = (0.003 + Math.random() * 0.007) * (Math.random() > 0.5 ? 1 : -1)
      pInclination[i] = (Math.random() - 0.5) * Math.PI

      const t = Math.random()
      const col = t < 0.5
        ? new THREE.Color().lerpColors(c1, cM, t * 2)
        : new THREE.Color().lerpColors(cM, c2, (t - 0.5) * 2)
      pColors[i * 3]     = col.r
      pColors[i * 3 + 1] = col.g
      pColors[i * 3 + 2] = col.b

      pSizes[i] = 1.5 + Math.random() * 2.5
    }

    const pGeo = new THREE.BufferGeometry()
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPositions, 3))
    pGeo.setAttribute('color',    new THREE.BufferAttribute(pColors, 3))
    pGeo.setAttribute('size',     new THREE.BufferAttribute(pSizes, 1))

    const pMat = new THREE.PointsMaterial({
      size: 0.03,
      vertexColors: true,
      transparent: true,
      opacity: 0.75,
      sizeAttenuation: true,
      depthWrite: false,
    })
    const particles = new THREE.Points(pGeo, pMat)
    scene.add(particles)

    // ── Mouse tracking ────────────────────────────────────────
    let mouseX = 0
    let mouseY = 0
    let targetMouseX = 0
    let targetMouseY = 0

    const onMouseMove = (e: MouseEvent) => {
      const rect = mount.getBoundingClientRect()
      targetMouseX = ((e.clientX - rect.left) / rect.width  - 0.5) * 2
      targetMouseY = ((e.clientY - rect.top)  / rect.height - 0.5) * 2
    }
    mount.addEventListener('mousemove', onMouseMove)

    // ── Resize ────────────────────────────────────────────────
    const onResize = () => {
      if (!mount) return
      const w = mount.clientWidth
      const h = mount.clientHeight
      renderer.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    const ro = new ResizeObserver(onResize)
    ro.observe(mount)

    // ── Animation loop ────────────────────────────────────────
    let rafId: number
    const clock = new THREE.Clock()

    const animate = () => {
      rafId = requestAnimationFrame(animate)
      const elapsed = clock.getElapsedTime()

      // Smooth mouse follow
      mouseX += (targetMouseX - mouseX) * 0.04
      mouseY += (targetMouseY - mouseY) * 0.04

      sphereMat.uniforms.uTime.value   = elapsed
      sphereMat.uniforms.uMouseX.value = mouseX
      sphereMat.uniforms.uMouseY.value = mouseY

      sphere.rotation.y = elapsed * 0.12
      sphere.rotation.x = Math.sin(elapsed * 0.07) * 0.15

      ring.rotation.z  = elapsed * 0.08
      ring2.rotation.z = -elapsed * 0.05

      // Update particles
      const pos = pGeo.attributes.position as THREE.BufferAttribute
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        pAngles[i] += pSpeeds[i]
        const r   = pRadii[i]
        const inc = pInclination[i] + Math.sin(elapsed * 0.2 + i) * 0.05
        pos.setXYZ(
          i,
          r * Math.cos(pAngles[i]) * Math.cos(inc),
          r * Math.sin(inc),
          r * Math.sin(pAngles[i]) * Math.cos(inc),
        )
      }
      pos.needsUpdate = true

      renderer.render(scene, camera)
    }
    animate()

    // ── Cleanup ───────────────────────────────────────────────
    return () => {
      cancelAnimationFrame(rafId)
      ro.disconnect()
      mount.removeEventListener('mousemove', onMouseMove)
      mount.removeChild(renderer.domElement)
      renderer.dispose()
      sphereGeo.dispose()
      sphereMat.dispose()
      wireGeo.dispose()
      wireMat.dispose()
      ringGeo.dispose()
      ringMat.dispose()
      pGeo.dispose()
      pMat.dispose()
    }
  }, [])

  return (
    <div
      ref={mountRef}
      className={cn('w-full h-full', className)}
      aria-hidden="true"
    />
  )
}
