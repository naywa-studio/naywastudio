'use client'

import Image from 'next/image'
import Link from 'next/link'
import { m } from 'framer-motion'

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

const fu = (delay: number) => ({
  initial: { opacity: 0, y: 32 },
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
      }}
    >
      {/* ── Background image ───────────────────────────────────────────── */}
      <Image
        src="https://images.unsplash.com/photo-1497366216548-37526070297c?w=1920&q=80"
        alt="Équipe au travail dans un bureau moderne"
        fill
        priority
        sizes="100vw"
        style={{ objectFit: 'cover', objectPosition: 'center 30%' }}
      />

      {/* ── Gradient overlays ──────────────────────────────────────────── */}
      {/* Main bottom-to-top darkening for text readability */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(to top, rgba(4,2,16,0.92) 0%, rgba(4,2,16,0.65) 35%, rgba(4,2,16,0.3) 65%, rgba(4,2,16,0.15) 100%)',
        }}
      />

      {/* Purple tint — bottom-left corner */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(ellipse 70% 60% at 0% 100%, rgba(124,99,200,0.32) 0%, transparent 60%)',
        }}
      />

      {/* Subtle top vignette for Navbar readability */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 160,
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.28) 0%, transparent 100%)',
        }}
      />

      {/* ── Bottom-left content ────────────────────────────────────────── */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
        }}
      >
        <div
          style={{
            maxWidth: 1152,
            margin: '0 auto',
            padding: '0 56px 80px',
          }}
          className="hero-content"
        >
          {/* Badge */}
          <m.div {...fu(0.1)} style={{ marginBottom: 22 }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                background: 'rgba(255,255,255,0.1)',
                border: '1px solid rgba(255,255,255,0.22)',
                color: 'rgba(255,255,255,0.9)',
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.09em',
                textTransform: 'uppercase' as const,
                borderRadius: 100,
                padding: '6px 16px',
                fontFamily: 'var(--font-inter), sans-serif',
                backdropFilter: 'blur(8px)',
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: '#C8BCEC',
                  boxShadow: '0 0 8px rgba(200,188,236,0.9)',
                  flexShrink: 0,
                }}
              />
              AI Workforce Studio
            </span>
          </m.div>

          {/* H1 */}
          <m.h1
            {...fu(0.18)}
            style={{
              fontFamily: 'var(--font-space-grotesk), sans-serif',
              fontWeight: 800,
              fontSize: 'clamp(38px, 5.2vw, 70px)',
              lineHeight: 1.06,
              letterSpacing: '-0.035em',
              color: '#FFFFFF',
              margin: '0 0 22px',
              maxWidth: '16ch',
            }}
          >
            Votre équipe<br />
            d&apos;agents IA,<br />
            opérationnelle<br />
            en{' '}
            <span
              style={{
                background: 'linear-gradient(120deg, #C8BCEC 0%, #A48FDB 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              48h
            </span>
            .
          </m.h1>

          {/* Subtitle */}
          <m.p
            {...fu(0.26)}
            style={{
              fontFamily: 'var(--font-inter), sans-serif',
              fontSize: 'clamp(15px, 1.05vw, 18px)',
              color: 'rgba(255,255,255,0.68)',
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
              marginBottom: 44,
            }}
          >
            <button
              onClick={onOpenOnboarding}
              style={{
                background: '#FFFFFF',
                color: '#7C63C8',
                borderRadius: 12,
                padding: '14px 30px',
                fontSize: 15,
                fontWeight: 700,
                border: 'none',
                cursor: 'pointer',
                transition: 'all 200ms cubic-bezier(0.22, 1, 0.36, 1)',
                fontFamily: 'var(--font-inter), sans-serif',
                letterSpacing: '-0.01em',
                boxShadow: '0 4px 24px rgba(0,0,0,0.25)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)'
                e.currentTarget.style.boxShadow = '0 8px 36px rgba(0,0,0,0.35)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = '0 4px 24px rgba(0,0,0,0.25)'
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
                color: 'rgba(255,255,255,0.85)',
                fontSize: 15,
                fontWeight: 500,
                textDecoration: 'none',
                padding: '14px 22px',
                borderRadius: 12,
                border: '1px solid rgba(255,255,255,0.22)',
                background: 'rgba(255,255,255,0.08)',
                fontFamily: 'var(--font-inter), sans-serif',
                transition: 'all 150ms',
                backdropFilter: 'blur(6px)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.15)'
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.4)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.22)'
              }}
            >
              Voir le catalogue
            </Link>
          </m.div>

          {/* Trust pills */}
          <m.div
            {...fu(0.42)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              flexWrap: 'wrap' as const,
            }}
          >
            {['Déployé en 48h', 'Sans intégration technique', 'Agents sur-mesure'].map(
              (item, i, arr) => (
                <span key={item} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span
                    style={{
                      fontSize: 12,
                      color: 'rgba(255,255,255,0.48)',
                      fontFamily: 'var(--font-inter), sans-serif',
                      letterSpacing: '0.02em',
                    }}
                  >
                    {item}
                  </span>
                  {i < arr.length - 1 && (
                    <span
                      style={{
                        width: 3,
                        height: 3,
                        borderRadius: '50%',
                        background: 'rgba(255,255,255,0.25)',
                        display: 'inline-block',
                        flexShrink: 0,
                      }}
                    />
                  )}
                </span>
              )
            )}
          </m.div>
        </div>
      </div>

      {/* ── Scroll indicator ───────────────────────────────────────────── */}
      <m.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2, duration: 0.6 }}
        style={{
          position: 'absolute',
          bottom: 32,
          right: 56,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 6,
        }}
        className="scroll-indicator"
      >
        <span
          style={{
            fontSize: 10,
            letterSpacing: '0.12em',
            textTransform: 'uppercase' as const,
            color: 'rgba(255,255,255,0.35)',
            fontFamily: 'var(--font-inter), sans-serif',
            writingMode: 'vertical-rl' as const,
          }}
        >
          Scroll
        </span>
        <div
          style={{
            width: 1,
            height: 40,
            background: 'linear-gradient(to bottom, rgba(255,255,255,0.35), transparent)',
          }}
        />
      </m.div>

      <style>{`
        @media (max-width: 640px) {
          .hero-content {
            padding: 0 24px 64px !important;
          }
          .scroll-indicator {
            display: none !important;
          }
        }
      `}</style>
    </section>
  )
}
