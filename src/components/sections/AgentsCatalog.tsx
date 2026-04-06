'use client'

import { m } from 'framer-motion'
import { ArrowRight, Target, MessageCircle, PenTool, Settings } from 'lucide-react'
import { Card, Badge, GradientText } from '@/components/ui'

interface Agent {
  icon: React.ElementType
  badge: { label: string; variant: 'blue' | 'purple' | 'green' | 'gray' }
  title: string
  description: string
  features: string[]
  setup: string
  monthly: string
  available: boolean
  accentColor: string
}

const agents: Agent[] = [
  {
    icon: Target,
    badge: { label: 'Sales', variant: 'blue' },
    title: 'Sales Agent',
    description: 'Qualifie vos leads entrants, répond aux questions commerciales et prend des rendez-vous directement dans votre agenda.',
    features: ['Qualification automatique', 'Prise de RDV', 'CRM sync'],
    setup: '450€',
    monthly: '249€/mois',
    available: true,
    accentColor: '#0066FF',
  },
  {
    icon: MessageCircle,
    badge: { label: 'Support', variant: 'green' },
    title: 'Support Agent',
    description: 'Répond à vos clients 24h/24, 7j/7 sur tous vos canaux. Escalade vers un humain uniquement si nécessaire.',
    features: ['Support 24/7', 'Multi-canal', 'Escalade intelligente'],
    setup: '400€',
    monthly: '199€/mois',
    available: true,
    accentColor: '#10B981',
  },
  {
    icon: PenTool,
    badge: { label: 'Contenu', variant: 'purple' },
    title: 'Content Agent',
    description: 'Génère 20+ contenus par mois en autonomie : posts LinkedIn, articles de blog, newsletters — dans votre ton de voix.',
    features: ['20+ contenus/mois', 'Ton de voix personnalisé', 'Calendrier éditorial'],
    setup: '350€',
    monthly: '149€/mois',
    available: true,
    accentColor: '#7C3AED',
  },
  {
    icon: Settings,
    badge: { label: 'Back-Office', variant: 'gray' },
    title: 'Back-Office Agent',
    description: 'Automatise les tâches répétitives : saisie de données, relances, rapports, tri d\'emails — récupérez 10h par semaine.',
    features: ['Automatisations', 'Relances auto', 'Reporting hebdo'],
    setup: '400€',
    monthly: '199€/mois',
    available: false,
    accentColor: '#8B8BA8',
  },
]

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } },
}

const cardVariants = {
  hidden:  { opacity: 0, y: 28 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.65, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
  },
}

export function AgentsCatalog() {
  return (
    <section
      id="agents"
      className="relative py-24 sm:py-32"
      aria-labelledby="agents-heading"
    >
      {/* Background accent */}
      <div
        aria-hidden
        className="pointer-events-none absolute right-0 top-0 h-[500px] w-[500px] translate-x-1/2 -translate-y-1/4 rounded-full bg-[#0066FF]/[0.04] blur-[120px]"
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
            Le catalogue
          </p>
          <h2
            id="agents-heading"
            className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-[#F8F8FF]"
            style={{ fontFamily: 'var(--font-space-grotesk)' }}
          >
            4 agents,{' '}
            <GradientText direction="diagonal">un catalogue qui grandit</GradientText>
          </h2>
          <p className="mt-4 max-w-xl text-base text-[#8B8BA8] leading-relaxed">
            Chaque agent est pré-configuré pour votre secteur et peut être
            déployé en 48h sur votre site ou vos outils internes.
          </p>
        </m.div>

        {/* Grid */}
        <m.div
          className="grid grid-cols-1 gap-6 sm:grid-cols-2"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
        >
          {agents.map((agent) => (
            <m.div key={agent.title} variants={cardVariants}>
              <AgentCard agent={agent} />
            </m.div>
          ))}
        </m.div>
      </div>
    </section>
  )
}

function AgentCard({ agent }: { agent: Agent }) {
  const { icon: Icon, badge, title, description, features, setup, monthly, available, accentColor } = agent

  return (
    <Card className="group relative overflow-hidden h-full">
      {/* Top accent line */}
      <div
        className="absolute inset-x-0 top-0 h-px transition-opacity duration-500"
        style={{
          background: `linear-gradient(90deg, transparent, ${accentColor}80, transparent)`,
          opacity: available ? 1 : 0.3,
        }}
      />

      <div className="p-7 flex flex-col gap-5 h-full">
        {/* Header row */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
              style={{ backgroundColor: `${accentColor}18`, opacity: available ? 1 : 0.5 }}
            >
              <Icon size={19} style={{ color: accentColor }} aria-hidden />
            </div>
            <div className="flex flex-col gap-1.5">
              <Badge variant={badge.variant}>{badge.label}</Badge>
            </div>
          </div>
          {!available && (
            <Badge variant="gray">Prochainement</Badge>
          )}
        </div>

        {/* Title + description */}
        <div className="flex flex-col gap-2">
          <h3
            className="text-xl font-semibold text-[#F8F8FF]"
            style={{ fontFamily: 'var(--font-space-grotesk)', opacity: available ? 1 : 0.5 }}
          >
            {title}
          </h3>
          <p className="text-sm text-[#8B8BA8] leading-relaxed" style={{ opacity: available ? 1 : 0.6 }}>
            {description}
          </p>
        </div>

        {/* Features */}
        <ul className="flex flex-wrap gap-2" role="list">
          {features.map((f) => (
            <li
              key={f}
              className="rounded-md border border-[#1E1E2E] bg-[#0A0A0F] px-3 py-1 text-xs text-[#8B8BA8]"
            >
              {f}
            </li>
          ))}
        </ul>

        {/* Footer: price + CTA */}
        <div className="mt-auto flex items-center justify-between pt-2 border-t border-[#1E1E2E]">
          <div className="flex flex-col">
            <span className="text-xs text-[#4A4A6A]">À partir de</span>
            <div className="flex items-baseline gap-2">
              <span
                className="text-xl font-bold text-[#F8F8FF]"
                style={{ fontFamily: 'var(--font-space-grotesk)', opacity: available ? 1 : 0.4 }}
              >
                {setup}
              </span>
              <span className="text-sm text-[#4A4A6A]">setup · {monthly}</span>
            </div>
          </div>

          {available ? (
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-lg border border-[#1E1E2E] px-4 py-2 text-sm font-medium text-[#8B8BA8] transition-all duration-200 hover:border-[#0066FF] hover:text-[#0066FF] cursor-pointer"
              aria-label={`Découvrir le ${title}`}
            >
              Découvrir
              <ArrowRight size={13} aria-hidden />
            </button>
          ) : (
            <span className="text-xs text-[#4A4A6A]">Bientôt disponible</span>
          )}
        </div>
      </div>

      {/* Hover glow */}
      <div
        className="pointer-events-none absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"
        style={{
          background: `radial-gradient(400px at 50% 100%, ${accentColor}08, transparent)`,
        }}
        aria-hidden
      />
    </Card>
  )
}
