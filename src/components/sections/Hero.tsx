'use client'

import Link from 'next/link'
import { m } from 'framer-motion'
import { brand } from '@/lib/brand'

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
        justifyContent: 'flex-end',
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
          padding: '0 0 88px 56px',
        }}
        className="hero-content"
      >
        {/* H1 — serif éditorial (charte v2.0) */}
        <m.h1
          {...fu(0.10)}
          style={{
            fontFamily: brand.fontDisplay,
            fontWeight: 500,
            fontSize: 'clamp(44px, 6vw, 88px)',
            lineHeight: 0.98,
            letterSpacing: '-0.03em',
            color: brand.ink,
            margin: '0 0 28px',
            maxWidth: '14ch',
          }}
        >
          Nous traitons,<br />
          vous{' '}
          <span
            style={{
              fontFamily: brand.fontSerifAccent,
              fontWeight: 400,
              fontStyle: 'italic',
              letterSpacing: '-0.01em',
              background: `linear-gradient(120deg, ${brand.violet} 0%, ${brand.violetSoft} 100%)`,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            décidez
          </span>
          <span style={{ color: brand.ink }}>.</span>
        </m.h1>

        {/* Subtitle */}
        <m.p
          {...fu(0.18)}
          style={{
            fontFamily: brand.fontBody,
            fontSize: 'clamp(15px, 1.05vw, 18px)',
            color: brand.textSecondary,
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
              background: brand.violet,
              color: brand.white,
              borderRadius: brand.radiusMd,
              padding: '14px 30px',
              fontSize: 15,
              fontWeight: 700,
              textDecoration: 'none',
              transition: 'all 200ms cubic-bezier(0.22, 1, 0.36, 1)',
              fontFamily: brand.fontBody,
              letterSpacing: '-0.01em',
              boxShadow: brand.shadowViolet,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)'
              e.currentTarget.style.background = brand.violetDeep
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.background = brand.violet
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
              color: brand.ink,
              fontSize: 15,
              fontWeight: 500,
              textDecoration: 'none',
              padding: '14px 22px',
              borderRadius: brand.radiusMd,
              border: `1px solid ${brand.ink}`,
              background: 'transparent',
              fontFamily: brand.fontBody,
              transition: 'all 150ms',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = brand.ink
              e.currentTarget.style.color = brand.sable
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.color = brand.ink
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
            fontFamily: brand.fontBody,
            fontSize: 13,
            color: brand.textMuted,
            fontWeight: 500,
          }}
        >
          <span
            aria-hidden
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: brand.violet,
              boxShadow: '0 0 0 4px rgba(123,99,200,0.18)',
              display: 'inline-block',
              flexShrink: 0,
            }}
          />
          <span>
            <strong style={{ color: brand.ink, fontWeight: 700 }}>15 jours offerts</strong>
            {' · sans engagement · annulable à tout moment'}
          </span>
        </m.p>

      </div>

      <style>{`
        @media (max-width: 640px) {
          .hero-content {
            padding: 0 0 72px 24px !important;
          }
        }
      `}</style>
    </section>
  )
}
