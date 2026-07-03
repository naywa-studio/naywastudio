'use client'

import Link from 'next/link'
import { m } from 'framer-motion'
import { EyebrowTag } from '@/components/ui/EyebrowTag'

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

const fu = (delay: number) => ({
  initial: { opacity: 0, y: 28 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.75, delay, ease: EASE },
})

export function Hero() {
  return (
    <section
      style={{
        position: 'relative',
        minHeight: '100vh',
        overflow: 'hidden',
        background: 'transparent',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
      }}
    >
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

      <div
        style={{
          position: 'relative',
          zIndex: 1,
          maxWidth: 1152,
          margin: '0',
          width: '100%',
          padding: '0 32px 0 56px',
        }}
        className="hero-content"
      >
        {/* Eyebrow */}
        <m.div {...fu(0.04)} style={{ margin: '0 0 24px' }}>
          <EyebrowTag>Nora — l&apos;assistante IA du sourcing</EyebrowTag>
        </m.div>

        {/* H1 */}
        <m.h1
          {...fu(0.10)}
          style={{
            fontFamily: 'var(--font-title), sans-serif',
            fontWeight: 700,
            fontSize: 'clamp(40px, 5.6vw, 80px)',
            lineHeight: 1.04,
            letterSpacing: '-0.03em',
            color: '#111827',
            margin: '0 0 28px',
            maxWidth: '14ch',
          }}
        >
          L&apos;IA traite,<br />
          vous{' '}
          <span
            style={{
              fontFamily: 'var(--font-accent), serif',
              fontWeight: 700,
              fontStyle: 'italic',
              letterSpacing: '-0.01em',
              color: '#7C63C8',
            }}
          >
            décidez
          </span>
          <span style={{ color: '#111827' }}>.</span>
        </m.h1>

        {/* Subtitle */}
        <m.p
          {...fu(0.18)}
          style={{
            fontFamily: 'var(--font-inter), sans-serif',
            fontSize: 'clamp(15px, 1.05vw, 18px)',
            color: '#4B5563',
            lineHeight: 1.75,
            maxWidth: '54ch',
            margin: '0 0 40px',
          }}
        >
          Naywa Studio conçoit des packages d&apos;optimisation de process
          métier augmentés par l&apos;intelligence artificielle. Notre premier
          package est dédié au sourcing&nbsp;: Nora, l&apos;assistante IA qui
          range, score, anonymise et suit votre vivier de candidats, sans
          jamais agir à votre place.
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
          <Link
            href="/login?mode=signup"
            style={{
              background: '#7C63C8',
              color: '#FFFFFF',
              borderRadius: 12,
              padding: '14px 30px',
              fontSize: 15,
              fontWeight: 700,
              textDecoration: 'none',
              transition: 'all 200ms cubic-bezier(0.22, 1, 0.36, 1)',
              fontFamily: 'var(--font-inter), sans-serif',
              letterSpacing: '-0.01em',
              boxShadow: '0 4px 20px rgba(124,99,200,0.28)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
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
            Démarrer votre essai gratuit →
          </Link>

          <a
            href="/solutions"
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
            Découvrir nos solutions
          </a>
        </m.div>

        {/* Trial reassurance line */}
        <m.p
          {...fu(0.42)}
          style={{
            margin: '18px 0 0',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            fontFamily: 'var(--font-inter), sans-serif',
            fontSize: 13,
            color: '#6B7280',
            fontWeight: 500,
          }}
        >
          <span
            aria-hidden
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: '#7C63C8',
              boxShadow: '0 0 0 4px rgba(124,99,200,0.18)',
              display: 'inline-block',
              flexShrink: 0,
            }}
          />
          <span>
            <strong style={{ color: '#111827', fontWeight: 700 }}>15 jours offerts</strong>
            {' · sans engagement · annulable à tout moment'}
          </span>
        </m.p>

      </div>

      <style>{`
        @media (max-width: 640px) {
          .hero-content {
            padding: 0 20px 0 24px !important;
          }
        }
      `}</style>
    </section>
  )
}
