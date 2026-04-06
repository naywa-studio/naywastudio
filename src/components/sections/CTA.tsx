'use client'

import { m } from 'framer-motion'
import { ArrowRight, Phone } from 'lucide-react'

export function CTA() {
  return (
    <section
      id="contact"
      className="relative py-24 sm:py-32 overflow-hidden"
      aria-labelledby="cta-heading"
    >
      {/* ── Background gradient ───────────────────────── */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
      >
        {/* Deep blue base */}
        <div className="absolute inset-0 bg-linear-to-br from-[#001F80]/40 via-[#0A0A0F] to-[#2D0080]/30" />
        {/* Radial centre glow */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[600px] w-[900px] rounded-full bg-[#0066FF]/[0.12] blur-[100px]" />
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[300px] w-[500px] rounded-full bg-[#7C3AED]/[0.10] blur-[80px]" />
        {/* Noise grid */}
        <div
          className="absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px),
                              linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)`,
            backgroundSize: '48px 48px',
          }}
        />
        {/* Top + bottom fade */}
        <div className="absolute inset-x-0 top-0 h-24 bg-linear-to-b from-[#0A0A0F] to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-24 bg-linear-to-t from-[#0A0A0F] to-transparent" />
      </div>

      <div className="relative mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 flex flex-col items-center text-center gap-8">
        {/* Icon badge */}
        <m.div
          initial={{ opacity: 0, scale: 0.8 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
          className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[#0066FF]/30 bg-[#0066FF]/15"
          aria-hidden
        >
          <Phone size={24} className="text-[#0066FF]" />
        </m.div>

        {/* Title */}
        <m.h2
          id="cta-heading"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, delay: 0.05, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
          className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-[#F8F8FF] leading-tight"
          style={{ fontFamily: 'var(--font-space-grotesk)' }}
        >
          Prêt à déployer votre{' '}
          <span className="bg-clip-text text-transparent bg-linear-to-r from-[#60A5FA] via-[#818CF8] to-[#A78BFA]">
            premier agent IA&nbsp;?
          </span>
        </m.h2>

        {/* Subtitle */}
        <m.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, delay: 0.12, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
          className="text-base sm:text-lg text-[#8B8BA8] leading-relaxed max-w-lg"
        >
          On analyse vos besoins, on vous recommande le bon agent, et on le
          déploie en 48h. Aucune promesse sans résultat.
        </m.p>

        {/* CTA button */}
        <m.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, delay: 0.2, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
        >
          <button
            type="button"
            className="group inline-flex items-center gap-2.5 rounded-xl bg-[#0066FF] px-8 py-4 text-base font-semibold text-white transition-all duration-200 hover:bg-[#0047CC] shadow-[0_0_40px_0_rgba(0,102,255,0.35)] hover:shadow-[0_0_56px_4px_rgba(0,102,255,0.45)] cursor-pointer"
          >
            Réserver un appel découverte gratuit
            <ArrowRight
              size={17}
              aria-hidden
              className="transition-transform duration-200 group-hover:translate-x-0.5"
            />
          </button>
        </m.div>

        {/* Trust note */}
        <m.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.35, duration: 0.6 }}
          className="text-sm text-[#4A4A6A]"
        >
          Premier appel de 30 min offert · Réponse sous 24h · Sans engagement
        </m.p>
      </div>
    </section>
  )
}
