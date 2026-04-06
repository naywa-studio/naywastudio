'use client'

import { useEffect, useRef } from 'react'
import { m } from 'framer-motion'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { Search, Cpu, BarChart2 } from 'lucide-react'
import { GradientText } from '@/components/ui'

gsap.registerPlugin(ScrollTrigger)

const steps = [
  {
    number: '01',
    icon: Search,
    title: 'Choisissez votre agent',
    description:
      'Un audit de 30 minutes pour identifier vos besoins prioritaires. On vous recommande l\'agent le plus adapté à votre situation et votre secteur.',
    detail: 'Appel découverte · Diagnostic offert · Sans engagement',
    color: '#0066FF',
  },
  {
    number: '02',
    icon: Cpu,
    title: 'Déploiement en 48h',
    description:
      'Notre équipe configure l\'agent sur votre base de connaissances, l\'intègre sur votre site ou vos outils, et teste chaque scénario avec vous.',
    detail: 'Configuration · Intégration · Recette',
    color: '#6366F1',
  },
  {
    number: '03',
    icon: BarChart2,
    title: 'L\'agent travaille, vous suivez',
    description:
      'Votre agent opère en autonomie 24/7. Chaque mois, vous recevez un rapport de performance et pouvez demander des ajustements.',
    detail: 'Dashboard · Rapport mensuel · Optimisations incluses',
    color: '#7C3AED',
  },
]

export function HowItWorks() {
  const sectionRef = useRef<HTMLElement>(null)
  const stepsRef   = useRef<HTMLElement[]>([])
  const lineRef    = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const ctx = gsap.context(() => {
      // Animate the vertical connector line
      if (lineRef.current) {
        gsap.fromTo(
          lineRef.current,
          { scaleY: 0, transformOrigin: 'top center' },
          {
            scaleY: 1,
            ease: 'none',
            scrollTrigger: {
              trigger: sectionRef.current,
              start: 'top 70%',
              end: 'bottom 60%',
              scrub: 1,
            },
          },
        )
      }

      // Animate each step card
      stepsRef.current.forEach((el, i) => {
        if (!el) return
        gsap.fromTo(
          el,
          { opacity: 0, x: i % 2 === 0 ? -40 : 40, y: 20 },
          {
            opacity: 1,
            x: 0,
            y: 0,
            duration: 0.8,
            ease: 'power3.out',
            scrollTrigger: {
              trigger: el,
              start: 'top 80%',
              toggleActions: 'play none none none',
            },
          },
        )
      })
    }, sectionRef)

    return () => ctx.revert()
  }, [])

  return (
    <section
      ref={sectionRef}
      id="comment"
      className="relative py-24 sm:py-32 overflow-hidden"
      aria-labelledby="how-heading"
    >
      {/* Background */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 h-[600px] w-[400px] -translate-x-1/2 rounded-full bg-[#0066FF]/[0.04] blur-[120px]"
      />

      <div className="relative mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <m.div
          className="mb-20 flex flex-col items-center text-center"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
        >
          <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-[#0066FF]">
            Comment ça marche
          </p>
          <h2
            id="how-heading"
            className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-[#F8F8FF]"
            style={{ fontFamily: 'var(--font-space-grotesk)' }}
          >
            De zéro à{' '}
            <GradientText>opérationnel</GradientText>
            {' '}en 48h
          </h2>
        </m.div>

        {/* Timeline */}
        <div className="relative">
          {/* Vertical connector */}
          <div
            aria-hidden
            className="absolute left-6 top-0 bottom-0 w-px bg-[#1E1E2E] sm:left-1/2 sm:-translate-x-px hidden sm:block"
          >
            <div
              ref={lineRef}
              className="absolute inset-0 bg-linear-to-b from-[#0066FF] via-[#6366F1] to-[#7C3AED]"
            />
          </div>

          {/* Steps */}
          <ol className="flex flex-col gap-16" role="list">
            {steps.map(({ number, icon: Icon, title, description, detail, color }, i) => (
              <li
                key={number}
                ref={(el: HTMLLIElement | null) => { if (el) stepsRef.current[i] = el }}
                className={`relative flex flex-col gap-4 sm:flex-row sm:gap-12 sm:items-center ${
                  i % 2 === 0 ? 'sm:flex-row' : 'sm:flex-row-reverse'
                }`}
              >
                {/* Number node (center on desktop) */}
                <div className="absolute left-0 sm:left-1/2 sm:-translate-x-1/2 flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-[#1E1E2E] bg-[#0A0A0F] z-10"
                  style={{ borderColor: `${color}50` }}
                >
                  <span
                    className="text-sm font-bold"
                    style={{ color, fontFamily: 'var(--font-space-grotesk)' }}
                  >
                    {number}
                  </span>
                </div>

                {/* Content card — alternates left/right */}
                <div className={`pl-16 sm:pl-0 sm:w-[calc(50%-3rem)] ${i % 2 !== 0 ? 'sm:text-right' : ''}`}>
                  <div
                    className="rounded-2xl border border-[#1E1E2E] bg-[#111118] p-6 flex flex-col gap-4 transition-all duration-300 hover:border-[#2E2E4E] hover:shadow-[0_0_32px_0_rgba(0,102,255,0.06)]"
                  >
                    <div className={`flex items-center gap-3 ${i % 2 !== 0 ? 'sm:flex-row-reverse' : ''}`}>
                      <div
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                        style={{ backgroundColor: `${color}15` }}
                      >
                        <Icon size={17} style={{ color }} aria-hidden />
                      </div>
                      <h3
                        className="text-lg font-semibold text-[#F8F8FF]"
                        style={{ fontFamily: 'var(--font-space-grotesk)' }}
                      >
                        {title}
                      </h3>
                    </div>
                    <p className="text-sm text-[#8B8BA8] leading-relaxed">
                      {description}
                    </p>
                    <p
                      className="text-xs font-medium"
                      style={{ color: `${color}CC` }}
                    >
                      {detail}
                    </p>
                  </div>
                </div>

                {/* Spacer for the other side */}
                <div className="hidden sm:block sm:w-[calc(50%-3rem)]" aria-hidden />
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  )
}
