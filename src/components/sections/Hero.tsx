'use client'

import Link from 'next/link'
import { m } from 'framer-motion'

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

const fu = (delay: number) => ({
  initial: { opacity: 0, y: 28 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.75, delay, ease: EASE },
})

export function Hero({ onOpenOnboarding }: { onOpenOnboarding: () => void }) {
  return (
    <section
      style={{
        position: 'relative',
        minHeight: '100vh',
        overflow: 'hidden',
        background: 'transparent',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
      }}
    >
      {/* ── Subtle surface gradient — top right ────────────────────────── */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(ellipse 65% 55% at 85% 10%, rgba(124,99,200,0.06) 0%, transparent 65%),' +
            'radial-gradient(ellipse 50% 40% at 10% 90%, rgba(184,174,222,0.05) 0%, transparent 60%)',
          pointerEvents: 'none',
        }}
      />

      {/* ── Bottom-left content ────────────────────────────────────────── */}
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          maxWidth: 1152,
          margin: '0 auto',
          width: '100%',
          padding: '0 56px 88px',
        }}
        className="hero-content"
      >
        {/* H1 */}
        <m.h1
          {...fu(0.18)}
          style={{
            fontFamily: 'var(--font-space-grotesk), sans-serif',
            fontWeight: 700,
            fontSize: 'clamp(40px, 5.6vw, 80px)',
            lineHeight: 1.04,
            letterSpacing: '-0.035em',
            color: '#111827',
            margin: '0 0 28px',
            maxWidth: '14ch',
          }}
        >
          Votre équipe<br />
          d&apos;
          <span
            style={{
              fontFamily: 'var(--font-instrument-serif), ui-serif, Georgia, serif',
              fontWeight: 400,
              fontStyle: 'italic',
              letterSpacing: '-0.015em',
              color: '#7C63C8',
            }}
          >
            agents&nbsp;IA
          </span>
          ,<br />
          opérationnelle<br />
          en&nbsp;
          <span
            style={{
              fontFamily: 'var(--font-instrument-serif), ui-serif, Georgia, serif',
              fontWeight: 400,
              fontStyle: 'italic',
              letterSpacing: '-0.01em',
              background: 'linear-gradient(120deg, #7C63C8 0%, #B8AEDE 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            48h
          </span>
          <span style={{ color: '#111827' }}>.</span>
        </m.h1>

        {/* Subtitle */}
        <m.p
          {...fu(0.26)}
          style={{
            fontFamily: 'var(--font-inter), sans-serif',
            fontSize: 'clamp(15px, 1.05vw, 18px)',
            color: '#4B5563',
            lineHeight: 1.75,
            maxWidth: '50ch',
            margin: '0 0 40px',
          }}
        >
          Nawa Studio déploie des agents IA sur-mesure pour automatiser
          vos processus métier — et vous rendre du temps sur ce qui
          compte vraiment.
        </m.p>

        {/* CTAs */}
        <m.div
          {...fu(0.34)}
          style={{
            display: 'flex',
            gap: 12,
            flexWrap: 'wrap' as const,
            alignItems: 'center',
          }}
        >
          <button
            onClick={onOpenOnboarding}
            style={{
              background: '#7C63C8',
              color: '#FFFFFF',
              borderRadius: 12,
              padding: '14px 30px',
              fontSize: 15,
              fontWeight: 700,
              border: 'none',
              cursor: 'pointer',
              transition: 'all 200ms cubic-bezier(0.22, 1, 0.36, 1)',
              fontFamily: 'var(--font-inter), sans-serif',
              letterSpacing: '-0.01em',
              boxShadow: '0 4px 20px rgba(124,99,200,0.28)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)'
              e.currentTarget.style.boxShadow = '0 8px 32px rgba(124,99,200,0.4)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.boxShadow = '0 4px 20px rgba(124,99,200,0.28)'
            }}
          >
            Trouver mon agent →
          </button>

          <Link
            href="/catalogue"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              color: '#4B5563',
              fontSize: 15,
              fontWeight: 500,
              textDecoration: 'none',
              padding: '14px 22px',
              borderRadius: 12,
              border: '1px solid #E2DAF6',
              background: 'transparent',
              fontFamily: 'var(--font-inter), sans-serif',
              transition: 'all 150ms',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#F8F6FF'
              e.currentTarget.style.borderColor = '#B8AEDE'
              e.currentTarget.style.color = '#7C63C8'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.borderColor = '#E2DAF6'
              e.currentTarget.style.color = '#4B5563'
            }}
          >
            Voir le catalogue
          </Link>
        </m.div>

      </div>

      <style>{`
        @media (max-width: 640px) {
          .hero-content {
            padding: 0 24px 72px !important;
          }
        }
      `}</style>
    </section>
  )
}
