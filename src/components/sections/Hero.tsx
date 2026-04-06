'use client'

import Link from 'next/link'
import { m, type Variants } from 'framer-motion'
import { ArrowRight, Zap, Clock, Rocket } from 'lucide-react'
import { Button, Badge, GradientText } from '@/components/ui'

const fadeUp: Variants = {
  hidden:  { opacity: 0, y: 28 },
  visible: (delay: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.7,
      ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
      delay,
    },
  }),
}

const metrics = [
  { icon: Zap,    value: '50+', label: 'automatisations' },
  { icon: Clock,  value: '10h', label: '/semaine économisées' },
  { icon: Rocket, value: '48h', label: 'déploiement' },
]

export function Hero() {
  return (
    <section
      className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden pt-16"
      aria-labelledby="hero-heading"
    >
      {/* Content sits above the fixed NeuralScene canvas (z-0) */}
      <div className="relative z-10 mx-auto w-full max-w-4xl px-4 sm:px-6 lg:px-8 flex flex-col items-center text-center gap-7 py-24">

        {/* Badge */}
        <m.div variants={fadeUp} custom={0} initial="hidden" animate="visible">
          <Badge
            variant="blue"
            className="py-1.5 px-3 text-xs font-semibold tracking-widest uppercase"
          >
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
          className="text-4xl sm:text-5xl md:text-6xl xl:text-7xl font-bold leading-[1.07] tracking-tight text-[#F8F8FF]"
          style={{ fontFamily: 'var(--font-space-grotesk)' }}
        >
          Des agents IA qui{' '}
          <GradientText direction="diagonal">travaillent</GradientText>
          <br className="hidden sm:block" />
          {' '}pour votre business
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
          className="flex flex-wrap items-center justify-center gap-3 sm:gap-4"
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
          custom={0.42}
          initial="hidden"
          animate="visible"
          className="flex flex-wrap items-center justify-center gap-5 sm:gap-8 pt-2"
          aria-label="Chiffres clés"
        >
          {metrics.map(({ icon: Icon, value, label }, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0066FF]/10 border border-[#0066FF]/20 shrink-0">
                <Icon size={14} className="text-[#0066FF]" aria-hidden />
              </div>
              <span
                className="text-lg font-bold text-[#F8F8FF]"
                style={{ fontFamily: 'var(--font-space-grotesk)' }}
              >
                {value}
              </span>
              <span className="text-xs text-[#8B8BA8]">{label}</span>
              {i < metrics.length - 1 && (
                <span className="ml-3 h-4 w-px bg-[#1E1E2E]" aria-hidden />
              )}
            </div>
          ))}
        </m.div>
      </div>

      {/* Bottom fade so neural scene dissolves into next section */}
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-0 inset-x-0 h-40 bg-linear-to-t from-[#0A0A0F] to-transparent z-10"
      />
    </section>
  )
}
