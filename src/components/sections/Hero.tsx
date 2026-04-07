'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { m } from 'framer-motion'

const AnimatedBackground = dynamic(() => import('@/components/ui/AnimatedBackground'), { ssr: false })

export function Hero() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden px-6 pt-24 pb-20">
      <AnimatedBackground />

      <div className="relative z-10 flex flex-col items-center text-center max-w-2xl mx-auto gap-6">

        {/* Badge */}
        <m.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4 }}
          style={{
            background: '#EEE9FB',
            color: '#7C63C8',
            fontSize: 12,
            fontWeight: 500,
            borderRadius: 100,
            padding: '6px 14px',
          }}
        >
          Agents IA · Sourcing automatisé
        </m.div>

        {/* H1 */}
        <m.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          style={{
            fontFamily: 'var(--font-space-grotesk), sans-serif',
            fontWeight: 700,
            fontSize: 'clamp(34px, 5vw, 54px)',
            color: '#111827',
            lineHeight: 1.1,
            letterSpacing: '-0.02em',
          }}
        >
          Votre sourcing, piloté par des agents IA.
        </m.h1>

        {/* Subtitle */}
        <m.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          style={{
            fontSize: 17,
            color: '#4B5563',
            maxWidth: 500,
            lineHeight: 1.6,
          }}
        >
          Nawa Studio déploie des agents IA spécialisés pour automatiser votre sourcing de candidats
          — du simple tri de CVs au processus complet de recrutement.
        </m.p>

        {/* CTA principal */}
        <m.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}
        >
          <Link
            href="/catalogue"
            style={{
              background: '#7C63C8',
              color: '#FFFFFF',
              borderRadius: 12,
              padding: '16px 32px',
              fontSize: 16,
              fontWeight: 600,
              textDecoration: 'none',
              transition: 'background 150ms, box-shadow 150ms',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#6B54B2'
              e.currentTarget.style.boxShadow = '0 4px 20px rgba(124,99,200,0.3)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#7C63C8'
              e.currentTarget.style.boxShadow = 'none'
            }}
          >
            Découvrir le Package Sourcing →
          </Link>
        </m.div>

        {/* Lien secondaire */}
        <Link
          href="/espace-client"
          style={{ color: '#7C63C8', fontSize: 14, textDecoration: 'none' }}
          onMouseEnter={(e) => (e.currentTarget.style.textDecoration = 'underline')}
          onMouseLeave={(e) => (e.currentTarget.style.textDecoration = 'none')}
        >
          Accéder à mon espace client
        </Link>

      </div>

    </section>
  )
}
