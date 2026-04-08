'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { m } from 'framer-motion'

// 3-D desk scene — desktop only (right 62 % of viewport)
const ThreeDesktopScene = dynamic(
  () => import('@/components/ui/ThreeDesktopScene'),
  { ssr: false }
)

// Lightweight canvas bubbles — kept for mobile
const AnimatedBackground = dynamic(
  () => import('@/components/ui/AnimatedBackground'),
  { ssr: false }
)

export function Hero({ onOpenOnboarding }: { onOpenOnboarding: () => void }) {
  return (
    <section className="relative min-h-screen overflow-hidden">

      {/* ── Backgrounds ────────────────────────────────────────────────── */}
      {/* 3-D scene (all sizes; on mobile covers full width at low opacity) */}
      <ThreeDesktopScene />

      {/* Bubble canvas — mobile only */}
      <div className="md:hidden">
        <AnimatedBackground />
      </div>

      {/* ── Content ────────────────────────────────────────────────────── */}
      {/*
        Layout strategy:
          - flex column fills full viewport height
          - mt-auto pushes inner box to the bottom
          - On mobile → centered text
          - On md+  → left-aligned text, bottom-left corner
      */}
      <div className="relative z-10 flex flex-col min-h-screen pt-24">
        <div
          className="
            mt-auto
            mx-auto md:mx-0
            px-6 pb-14
            md:px-14 md:pb-20
            max-w-lg md:max-w-[520px]
            text-center md:text-left
            flex flex-col gap-5
          "
        >

          {/* Badge */}
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4 }}
            className="mx-auto md:mx-0"
            style={{
              display:      'inline-flex',
              width:        'fit-content',
              background:   '#EEE9FB',
              color:        '#7C63C8',
              fontSize:      12,
              fontWeight:    500,
              borderRadius: 100,
              padding:      '6px 14px',
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
              fontFamily:    'var(--font-space-grotesk), sans-serif',
              fontWeight:     700,
              fontSize:      'clamp(32px, 4.5vw, 52px)',
              color:         '#111827',
              lineHeight:     1.12,
              letterSpacing: '-0.02em',
              margin:         0,
            }}
          >
            Votre sourcing,<br />
            piloté par des agents IA.
          </m.h1>

          {/* Subtitle */}
          <m.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mx-auto md:mx-0"
            style={{
              fontSize:   16,
              color:      '#4B5563',
              lineHeight: 1.65,
              maxWidth:   460,
              margin:     0,
            }}
          >
            Nawa Studio déploie des agents IA spécialisés pour automatiser
            votre sourcing de candidats — du simple tri de CVs au processus
            complet de recrutement.
          </m.p>

          {/* CTAs */}
          <m.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="flex flex-wrap gap-3 justify-center md:justify-start items-center"
          >
            <button
              onClick={onOpenOnboarding}
              style={{
                background:   '#7C63C8',
                color:        '#FFFFFF',
                borderRadius:  12,
                padding:      '14px 28px',
                fontSize:      15,
                fontWeight:    600,
                border:       'none',
                cursor:       'pointer',
                transition:   'background 150ms, box-shadow 150ms',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background  = '#6B54B2'
                e.currentTarget.style.boxShadow   = '0 4px 20px rgba(124,99,200,0.3)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background  = '#7C63C8'
                e.currentTarget.style.boxShadow   = 'none'
              }}
            >
              Trouver mon agent en 2 min →
            </button>

            <Link
              href="/catalogue"
              style={{
                color:          '#7C63C8',
                fontSize:        15,
                fontWeight:      500,
                textDecoration: 'none',
                padding:        '14px 4px',
                display:        'inline-flex',
                alignItems:     'center',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.textDecoration = 'underline')}
              onMouseLeave={(e) => (e.currentTarget.style.textDecoration = 'none')}
            >
              Voir le catalogue complet
            </Link>
          </m.div>

        </div>
      </div>

    </section>
  )
}
