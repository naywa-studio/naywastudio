'use client'

import Link from 'next/link'
import { m } from 'framer-motion'

// ── Reusable fade-up helper ────────────────────────────────────────────────
const fu = (delay: number) => ({
  initial:    { opacity: 0, y: 28 },
  animate:    { opacity: 1, y: 0 },
  transition: { duration: 0.65, delay, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
})

// ── Component ──────────────────────────────────────────────────────────────
export function Hero({ onOpenOnboarding }: { onOpenOnboarding: () => void }) {
  return (
    <section className="relative min-h-screen overflow-hidden flex items-center justify-center">

      {/* ── Background ─────────────────────────────────────────────────── */}
      <div aria-hidden className="absolute inset-0 pointer-events-none select-none overflow-hidden">

        {/* Dot grid — masked to fade at edges */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              'radial-gradient(circle, rgba(124,99,200,0.13) 1px, transparent 1px)',
            backgroundSize: '28px 28px',
            maskImage:
              'radial-gradient(ellipse 90% 80% at 50% 40%, black 30%, transparent 100%)',
            WebkitMaskImage:
              'radial-gradient(ellipse 90% 80% at 50% 40%, black 30%, transparent 100%)',
          }}
        />

        {/* Top-right blob */}
        <div
          className="absolute -top-48 -right-32 w-[720px] h-[720px] rounded-full"
          style={{
            background:
              'radial-gradient(circle at center, rgba(124,99,200,0.13) 0%, transparent 65%)',
            animation: 'heroBlob1 14s ease-in-out infinite',
          }}
        />

        {/* Bottom-left blob */}
        <div
          className="absolute -bottom-28 -left-28 w-[560px] h-[560px] rounded-full"
          style={{
            background:
              'radial-gradient(circle at center, rgba(184,174,222,0.11) 0%, transparent 65%)',
            animation: 'heroBlob2 18s ease-in-out infinite',
          }}
        />

        {/* Center warm glow */}
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[640px] h-[320px]"
          style={{
            background:
              'radial-gradient(ellipse at center, rgba(238,233,251,0.55) 0%, transparent 70%)',
          }}
        />

        {/* Bottom fade */}
        <div
          className="absolute bottom-0 inset-x-0 h-48"
          style={{ background: 'linear-gradient(to bottom, transparent, rgba(255,255,255,0.9))' }}
        />
      </div>

      {/* ── Content ────────────────────────────────────────────────────── */}
      <div className="relative z-10 flex flex-col items-center text-center px-6 pt-28 pb-20 w-full max-w-4xl mx-auto">

        {/* Badge */}
        <m.div {...fu(0)} className="mb-9">
          <span
            style={{
              display:       'inline-flex',
              alignItems:    'center',
              gap:            8,
              background:    'rgba(124,99,200,0.07)',
              border:        '1px solid rgba(124,99,200,0.2)',
              color:         '#7C63C8',
              fontSize:       12,
              fontWeight:     600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase' as const,
              borderRadius:   100,
              padding:       '7px 18px',
              fontFamily:    'var(--font-inter), sans-serif',
            }}
          >
            <span
              style={{
                width:      6,
                height:     6,
                borderRadius: '50%',
                background: '#7C63C8',
                boxShadow:  '0 0 8px rgba(124,99,200,0.85)',
                flexShrink: 0,
              }}
            />
            AI Workforce Studio
          </span>
        </m.div>

        {/* H1 */}
        <m.h1
          {...fu(0.08)}
          style={{
            fontFamily:    'var(--font-space-grotesk), sans-serif',
            fontWeight:     800,
            fontSize:      'clamp(44px, 6.8vw, 82px)',
            lineHeight:     1.05,
            letterSpacing: '-0.035em',
            color:         '#111827',
            maxWidth:      '20ch',
            margin:         0,
          }}
        >
          Votre sourcing,
          <br />
          piloté par des{' '}
          <span
            style={{
              background:              'linear-gradient(130deg, #7C63C8 0%, #A48FDB 55%, #C8BCEC 100%)',
              WebkitBackgroundClip:    'text',
              WebkitTextFillColor:     'transparent',
              backgroundClip:          'text',
            }}
          >
            agents IA.
          </span>
        </m.h1>

        {/* Separator line */}
        <m.div
          {...fu(0.16)}
          style={{
            width:       48,
            height:       2,
            borderRadius: 2,
            background:  'linear-gradient(90deg, #7C63C8, rgba(124,99,200,0))',
            margin:      '28px 0 0',
          }}
        />

        {/* Subtitle */}
        <m.p
          {...fu(0.22)}
          style={{
            fontFamily: 'var(--font-inter), sans-serif',
            fontSize:   'clamp(16px, 1.25vw, 19px)',
            color:      '#6B7280',
            lineHeight:  1.75,
            maxWidth:   '52ch',
            marginTop:   20,
            fontWeight:  400,
          }}
        >
          Nawa Studio déploie des agents IA spécialisés pour automatiser
          votre sourcing de candidats — du simple tri de CVs au processus
          complet de recrutement.
        </m.p>

        {/* CTAs */}
        <m.div
          {...fu(0.3)}
          style={{
            marginTop:      44,
            display:        'flex',
            gap:             14,
            flexWrap:       'wrap' as const,
            justifyContent: 'center',
            alignItems:     'center',
          }}
        >
          <button
            onClick={onOpenOnboarding}
            style={{
              background:   '#7C63C8',
              color:        '#FFFFFF',
              borderRadius:  14,
              padding:      '15px 34px',
              fontSize:      15,
              fontWeight:    600,
              border:       'none',
              cursor:       'pointer',
              transition:   'all 180ms cubic-bezier(0.22, 1, 0.36, 1)',
              letterSpacing: '-0.01em',
              fontFamily:   'var(--font-inter), sans-serif',
              boxShadow:    '0 1px 2px rgba(0,0,0,0.06), 0 6px 20px rgba(124,99,200,0.24)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background  = '#6B54B2'
              e.currentTarget.style.transform   = 'translateY(-2px)'
              e.currentTarget.style.boxShadow   =
                '0 2px 4px rgba(0,0,0,0.08), 0 12px 32px rgba(124,99,200,0.38)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background  = '#7C63C8'
              e.currentTarget.style.transform   = 'translateY(0)'
              e.currentTarget.style.boxShadow   =
                '0 1px 2px rgba(0,0,0,0.06), 0 6px 20px rgba(124,99,200,0.24)'
            }}
          >
            Trouver mon agent en 2 min →
          </button>

          <Link
            href="/catalogue"
            style={{
              color:        '#7C63C8',
              fontSize:      15,
              fontWeight:    500,
              textDecoration: 'none',
              padding:      '15px 8px',
              display:      'inline-flex',
              alignItems:   'center',
              gap:           5,
              fontFamily:   'var(--font-inter), sans-serif',
              borderBottom: '1px solid transparent',
              transition:   'border-color 150ms, color 150ms',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderBottomColor = 'rgba(124,99,200,0.45)'
              e.currentTarget.style.color             = '#6B54B2'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderBottomColor = 'transparent'
              e.currentTarget.style.color             = '#7C63C8'
            }}
          >
            Voir le catalogue →
          </Link>
        </m.div>

        {/* Trust line */}
        <m.div
          {...fu(0.4)}
          style={{
            marginTop:   56,
            display:     'flex',
            alignItems:  'center',
            gap:          10,
            flexWrap:    'wrap' as const,
            justifyContent: 'center',
          }}
        >
          {[
            'Déployé en 48h',
            'Sans intégration technique',
            'Agents sur-mesure',
          ].map((item, i, arr) => (
            <span key={item} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span
                style={{
                  fontSize:      13,
                  color:         '#9CA3AF',
                  fontFamily:    'var(--font-inter), sans-serif',
                  letterSpacing: '0.01em',
                }}
              >
                {item}
              </span>
              {i < arr.length - 1 && (
                <span
                  style={{
                    width:      3,
                    height:     3,
                    borderRadius: '50%',
                    background: '#D1D5DB',
                    display:    'inline-block',
                    flexShrink: 0,
                  }}
                />
              )}
            </span>
          ))}
        </m.div>

      </div>

    </section>
  )
}
