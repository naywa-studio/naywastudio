'use client'

import { m } from 'framer-motion'
import { Zap, RefreshCw, LayoutGrid } from 'lucide-react'
import { Card, CardContent, GradientText } from '@/components/ui'

const services = [
  {
    icon: Zap,
    title: 'Déploiement en 48h',
    description:
      "Votre agent IA est opérationnel en moins de deux jours ouvrés. Audit, configuration, intégration — on s'occupe de tout.",
    highlight: '48h',
    color: '#0066FF',
  },
  {
    icon: RefreshCw,
    title: 'Abonnement mensuel',
    description:
      'Sans engagement long terme. Montez en puissance à votre rythme, ajoutez des agents quand vous en avez besoin.',
    highlight: 'Sans engagement',
    color: '#7C3AED',
  },
  {
    icon: LayoutGrid,
    title: 'Catalogue extensible',
    description:
      'Sales, Support, Contenu, Back-office — et de nouveaux agents IA toutes les 6 semaines pour répondre à vos besoins métier.',
    highlight: 'Toujours à jour',
    color: '#0066FF',
  },
]

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12 } },
}

const cardVariants = {
  hidden:  { opacity: 0, y: 32 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.65, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
  },
}

export function Services() {
  return (
    <section
      id="services"
      className="relative z-10 py-24 sm:py-32 overflow-hidden bg-[#0A0A0F]/80 backdrop-blur-sm"
      aria-labelledby="services-heading"
    >
      {/* Subtle background glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[600px] w-[600px] rounded-full bg-[#7C3AED]/[0.04] blur-[120px]"
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
            Ce qu&apos;on fait
          </p>
          <h2
            id="services-heading"
            className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-[#F8F8FF]"
            style={{ fontFamily: 'var(--font-space-grotesk)' }}
          >
            Des agents IA{' '}
            <GradientText>prêts à l&apos;emploi</GradientText>
          </h2>
          <p className="mt-4 max-w-xl text-base text-[#8B8BA8] leading-relaxed">
            Pas de développement sur mesure interminable. On déploie des agents
            IA éprouvés, directement branchés sur vos outils.
          </p>
        </m.div>

        {/* Cards */}
        <m.div
          className="grid grid-cols-1 gap-6 sm:grid-cols-3"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
        >
          {services.map(({ icon: Icon, title, description, highlight, color }) => (
            <m.div key={title} variants={cardVariants}>
              <Card
                variant="glass"
                className="group h-full p-px overflow-hidden"
              >
                {/* Animated border gradient on hover */}
                <div className="relative h-full rounded-xl bg-[#111118]/80 p-8 flex flex-col gap-5">
                  {/* Icon */}
                  <div
                    className="flex h-11 w-11 items-center justify-center rounded-xl border transition-colors duration-300"
                    style={{
                      backgroundColor: `${color}15`,
                      borderColor: `${color}30`,
                    }}
                  >
                    <Icon size={20} style={{ color }} aria-hidden />
                  </div>

                  {/* Highlight chip */}
                  <span
                    className="inline-flex w-fit rounded-full px-3 py-1 text-xs font-semibold"
                    style={{
                      backgroundColor: `${color}15`,
                      color,
                    }}
                  >
                    {highlight}
                  </span>

                  {/* Text */}
                  <div className="flex flex-col gap-2">
                    <h3
                      className="text-lg font-semibold text-[#F8F8FF]"
                      style={{ fontFamily: 'var(--font-space-grotesk)' }}
                    >
                      {title}
                    </h3>
                    <p className="text-sm text-[#8B8BA8] leading-relaxed">
                      {description}
                    </p>
                  </div>

                  {/* Bottom glow on hover */}
                  <div
                    className="pointer-events-none absolute inset-x-0 bottom-0 h-px opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                    style={{
                      background: `linear-gradient(90deg, transparent, ${color}60, transparent)`,
                    }}
                  />
                </div>
              </Card>
            </m.div>
          ))}
        </m.div>
      </div>
    </section>
  )
}
