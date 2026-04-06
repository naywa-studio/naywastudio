'use client'

import { m } from 'framer-motion'
import { Check, Sparkles } from 'lucide-react'
import { Badge, GradientText } from '@/components/ui'

interface PricingTier {
  name: string
  badge?: string
  price: string
  priceNote: string
  description: string
  features: string[]
  cta: string
  highlighted: boolean
}

const tiers: PricingTier[] = [
  {
    name: 'Starter',
    price: 'Dès 149€',
    priceNote: '/mois + setup unique',
    description: 'Idéal pour tester l\'impact d\'un premier agent IA sur votre activité.',
    features: [
      '1 agent au choix',
      'Déploiement en 48h',
      'Rapport mensuel',
      'Support email',
      '1 révision / trimestre',
    ],
    cta: 'Démarrer',
    highlighted: false,
  },
  {
    name: 'Business',
    badge: 'Populaire',
    price: 'Dès 449€',
    priceNote: '/mois + setup unique',
    description: 'La combinaison parfaite pour automatiser vos principales interactions.',
    features: [
      '3 agents au choix',
      'Déploiement en 48h',
      'Dashboard en temps réel',
      'Support prioritaire',
      'Révisions illimitées',
      'Intégration CRM incluse',
    ],
    cta: 'Choisir Business',
    highlighted: true,
  },
  {
    name: 'Enterprise',
    price: 'Sur devis',
    priceNote: 'offre personnalisée',
    description: 'Pour les entreprises avec des besoins spécifiques, un volume élevé ou une infrastructure dédiée.',
    features: [
      'Agents illimités',
      'SLA garanti 99,9%',
      'Infrastructure dédiée',
      'Onboarding sur site',
      'Account manager dédié',
      'Intégrations sur mesure',
    ],
    cta: 'Nous contacter',
    highlighted: false,
  },
]

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } },
}

const cardVariants = {
  hidden:  { opacity: 0, y: 32 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.65, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
  },
}

export function Pricing() {
  return (
    <section
      id="tarifs"
      className="relative py-24 sm:py-32 overflow-hidden"
      aria-labelledby="pricing-heading"
    >
      {/* Background glow behind highlighted card */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[500px] w-[500px] rounded-full bg-[#0066FF]/[0.06] blur-[120px]"
      />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <m.div
          className="mb-16 flex flex-col items-center text-center"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
        >
          <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-[#0066FF]">
            Tarifs
          </p>
          <h2
            id="pricing-heading"
            className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-[#F8F8FF]"
            style={{ fontFamily: 'var(--font-space-grotesk)' }}
          >
            Transparent,{' '}
            <GradientText>sans surprise</GradientText>
          </h2>
          <p className="mt-4 max-w-xl text-base text-[#8B8BA8] leading-relaxed">
            Un coût de setup unique pour la configuration, puis un abonnement
            mensuel sans engagement minimum.
          </p>
        </m.div>

        {/* Cards */}
        <m.div
          className="grid grid-cols-1 gap-6 sm:grid-cols-3 items-start"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
        >
          {tiers.map((tier) => (
            <m.div key={tier.name} variants={cardVariants} className="h-full">
              <PricingCard tier={tier} />
            </m.div>
          ))}
        </m.div>

        {/* No commitment note */}
        <m.p
          className="mt-10 text-center text-sm text-[#4A4A6A]"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.4, duration: 0.6 }}
        >
          Pas d&apos;engagement minimum · Résiliation à tout moment · Onboarding offert
        </m.p>
      </div>
    </section>
  )
}

function PricingCard({ tier }: { tier: PricingTier }) {
  const { name, badge, price, priceNote, description, features, cta, highlighted } = tier

  return (
    <div
      className={`relative flex flex-col h-full rounded-2xl border transition-all duration-300 ${
        highlighted
          ? 'border-[#0066FF]/50 bg-[#0A0A18] shadow-[0_0_60px_0_rgba(0,102,255,0.12)]'
          : 'border-[#1E1E2E] bg-[#111118] hover:border-[#2E2E4E]'
      }`}
    >
      {/* Highlighted top glow */}
      {highlighted && (
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-[#0066FF] to-transparent"
        />
      )}

      <div className="flex flex-col gap-6 p-7 flex-1">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3
            className="text-lg font-semibold text-[#F8F8FF]"
            style={{ fontFamily: 'var(--font-space-grotesk)' }}
          >
            {name}
          </h3>
          {badge && (
            <Badge variant="blue" className="flex items-center gap-1">
              <Sparkles size={10} aria-hidden />
              {badge}
            </Badge>
          )}
        </div>

        {/* Price */}
        <div className="flex flex-col gap-1">
          <div className="flex items-baseline gap-2">
            <span
              className="text-3xl font-bold text-[#F8F8FF]"
              style={{ fontFamily: 'var(--font-space-grotesk)' }}
            >
              {price}
            </span>
          </div>
          <span className="text-xs text-[#4A4A6A]">{priceNote}</span>
        </div>

        {/* Description */}
        <p className="text-sm text-[#8B8BA8] leading-relaxed border-b border-[#1E1E2E] pb-6">
          {description}
        </p>

        {/* Features */}
        <ul className="flex flex-col gap-3 flex-1" role="list">
          {features.map((f) => (
            <li key={f} className="flex items-start gap-3">
              <Check
                size={15}
                className={`mt-0.5 shrink-0 ${highlighted ? 'text-[#0066FF]' : 'text-[#4A4A6A]'}`}
                aria-hidden
              />
              <span className="text-sm text-[#8B8BA8]">{f}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* CTA */}
      <div className="px-7 pb-7">
        <button
          type="button"
          className={`w-full rounded-xl py-3 text-sm font-semibold transition-all duration-200 cursor-pointer ${
            highlighted
              ? 'bg-[#0066FF] text-white hover:bg-[#0047CC] shadow-[0_0_24px_0_rgba(0,102,255,0.3)] hover:shadow-[0_0_32px_4px_rgba(0,102,255,0.4)]'
              : 'border border-[#1E1E2E] text-[#8B8BA8] hover:border-[#2E2E4E] hover:text-[#F8F8FF]'
          }`}
        >
          {cta}
        </button>
      </div>
    </div>
  )
}
