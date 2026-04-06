'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { m, type Variants } from 'framer-motion'
import { ArrowRight, Zap, Clock, Rocket } from 'lucide-react'
import { Button, Badge, GradientText } from '@/components/ui'

// Load Three.js scene client-side only
const ThreeScene = dynamic(
  () => import('@/components/ui/ThreeScene').then((m) => m.ThreeScene),
  { ssr: false, loading: () => <ScenePlaceholder /> },
)

function ScenePlaceholder() {
  return (
    <div className="h-full w-full flex items-center justify-center">
      <div className="relative">
        <div className="h-64 w-64 rounded-full border border-[#0066FF]/20 animate-ping absolute inset-0" />
        <div className="h-64 w-64 rounded-full border border-[#7C3AED]/15 animate-pulse" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-4 w-4 rounded-full bg-[#0066FF] shadow-[0_0_24px_6px_rgba(0,102,255,0.4)] animate-pulse" />
        </div>
      </div>
    </div>
  )
}

// Framer Motion variants
const fadeUp: Variants = {
  hidden:  { opacity: 0, y: 28 },
  visible: (delay: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] as [number, number, number, number], delay },
  }),
}

const metrics = [
  { icon: Zap,    value: '50+',   label: 'automatisations' },
  { icon: Clock,  value: '10h',   label: '/semaine économisées' },
  { icon: Rocket, value: '48h',   label: 'déploiement' },
]

export function Hero() {
  return (
    <section
      className="relative min-h-screen flex flex-col justify-center overflow-hidden pt-16"
      aria-labelledby="hero-heading"
    >
      {/* ── Background glows ──────────────────────────────── */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
      >
        {/* Centre-right radial for the 3D scene */}
        <div className="absolute right-0 top-1/2 -translate-y-1/2 h-[700px] w-[700px] translate-x-1/4 rounded-full bg-[#0066FF]/[0.07] blur-[120px]" />
        <div className="absolute right-1/4 top-1/3 h-[400px] w-[400px] rounded-full bg-[#7C3AED]/[0.06] blur-[100px]" />
        {/* Subtle noise grid overlay */}
        <div
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px),
                              linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)`,
            backgroundSize: '60px 60px',
          }}
        />
      </div>

      <div className="relative mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-12 lg:gap-8 items-center min-h-[calc(100vh-4rem)] py-20 lg:py-0">

          {/* ── Left column — text (60%) ─────────────────── */}
          <div className="lg:col-span-3 flex flex-col items-start gap-6 lg:gap-8">

            {/* Badge */}
            <m.div
              variants={fadeUp}
              custom={0}
              initial="hidden"
              animate="visible"
            >
              <Badge variant="blue" className="py-1.5 px-3 text-xs font-semibold tracking-widest uppercase">
                <span className="h-1.5 w-1.5 rounded-full bg-[#0066FF] animate-pulse" aria-hidden />
                AI Workforce Studio
              </Badge>
            </m.div>

            {/* H1 */}
            <m.h1
              id="hero-heading"
              variants={fadeUp}
              custom={0.1}
              initial="hidden"
              animate="visible"
              className="text-4xl sm:text-5xl xl:text-6xl 2xl:text-7xl font-bold leading-[1.08] tracking-tight text-[#F8F8FF]"
              style={{ fontFamily: 'var(--font-space-grotesk)' }}
            >
              Des agents IA qui{' '}
              <GradientText direction="diagonal">
                travaillent
              </GradientText>{' '}
              pour votre business
            </m.h1>

            {/* Subtitle */}
            <m.p
              variants={fadeUp}
              custom={0.2}
              initial="hidden"
              animate="visible"
              className="text-base sm:text-lg text-[#8B8BA8] leading-relaxed max-w-xl"
            >
              Déployez en{' '}
              <span className="text-[#F8F8FF] font-medium">48h</span>{' '}
              des agents IA opérationnels sur votre site. Ils qualifient,
              répondent, relancent — pendant que vous vous concentrez sur
              l&apos;essentiel.
            </m.p>

            {/* CTAs */}
            <m.div
              variants={fadeUp}
              custom={0.3}
              initial="hidden"
              animate="visible"
              className="flex flex-wrap items-center gap-3 sm:gap-4"
            >
              <Button size="lg" asChild>
                <Link href="#agents" className="flex items-center gap-2">
                  Voir le catalogue
                  <ArrowRight size={16} aria-hidden />
                </Link>
              </Button>
              <Button variant="ghost" size="lg" asChild>
                <Link href="#contact">Réserver un appel</Link>
              </Button>
            </m.div>

            {/* Metrics strip */}
            <m.div
              variants={fadeUp}
              custom={0.45}
              initial="hidden"
              animate="visible"
              className="flex flex-wrap items-center gap-6 pt-2"
              aria-label="Chiffres clés"
            >
              {metrics.map(({ icon: Icon, value, label }, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0066FF]/10 border border-[#0066FF]/20 shrink-0">
                    <Icon size={14} className="text-[#0066FF]" aria-hidden />
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span
                      className="text-lg font-bold text-[#F8F8FF]"
                      style={{ fontFamily: 'var(--font-space-grotesk)' }}
                    >
                      {value}
                    </span>
                    <span className="text-xs text-[#8B8BA8]">{label}</span>
                  </div>
                  {i < metrics.length - 1 && (
                    <span className="ml-4 h-4 w-px bg-[#1E1E2E]" aria-hidden />
                  )}
                </div>
              ))}
            </m.div>
          </div>

          {/* ── Right column — 3D scene (40%) ───────────── */}
          <m.div
            className="lg:col-span-2 relative h-[360px] sm:h-[440px] lg:h-[560px]"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1.0, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
            aria-hidden
          >
            {/* Glow behind canvas */}
            <div className="absolute inset-0 rounded-3xl bg-[#0066FF]/[0.04] blur-3xl scale-110 pointer-events-none" />
            <ThreeScene className="relative z-10 h-full w-full" />
          </m.div>
        </div>
      </div>

      {/* ── Bottom fade ───────────────────────────────────── */}
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-0 inset-x-0 h-32 bg-linear-to-t from-[#0A0A0F] to-transparent"
      />
    </section>
  )
}
