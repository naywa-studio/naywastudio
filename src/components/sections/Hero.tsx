'use client'

import Link from 'next/link'
import { m } from 'framer-motion'
import { brand } from '@/lib/brand'
import { useLanguage } from '@/lib/i18n/LanguageContext'

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

const fu = (delay: number) => ({
  initial: { opacity: 0, y: 28 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.75, delay, ease: EASE },
})

const content = {
  // Slogan unifié : même formule ici, en pied de page et dans les balises
  // SEO. Trois variantes coexistaient auparavant.
  fr: {
    titleLine1: 'Nous traitons,',
    titleLine2Pre: 'vous',
    titleWord: 'décidez',
    // « Nous traitons » pourrait laisser croire que des humains chez Naywa
    // lisent vos données : la phrase nomme donc Nora immédiatement.
    subtitle:
      "Notre premier package est dédié au sourcing. Nora, l'assistante qui vient avec, lit vos CV, range votre vivier, note chaque candidat sur vos missions et prépare vos shortlists. Elle ne décide jamais à votre place.",
    ctaPrimary: "Démarrer l'essai gratuit →",
    ctaSecondary: 'Voir le produit',
    trialBold: '15 jours offerts',
    trialRest: ' · sans engagement · annulable à tout moment',
  },
  en: {
    titleLine1: 'We handle it,',
    titleLine2Pre: 'you',
    titleWord: 'decide',
    subtitle:
      'Our first package is built for sourcing. Nora, the assistant that comes with it, reads your CVs, organizes your talent pool, scores every candidate against your roles and prepares your shortlists. She never decides in your place.',
    ctaPrimary: 'Start the free trial →',
    ctaSecondary: 'See the product',
    trialBold: '15 days free',
    trialRest: ' · no commitment · cancel anytime',
  },
}

export function Hero() {
  const { lang } = useLanguage()
  const c = content[lang]

  return (
    <section
      className="hero-section"
      style={{
        position: 'relative',
        // Le hero était calé en bas de viewport : joli, mais il enterrait la
        // promesse et le CTA sous un grand vide. Recentré et raccourci pour
        // que les deux passent au-dessus de la ligne de flottaison.
        //
        // La navbar est FIXE et occupe ~84px en haut (20px de marge + 64px de
        // hauteur). Un contenu simplement centré passait donc dessous sur les
        // écrans courts (portables). D'où la marge haute, qui garantit que le
        // titre commence toujours SOUS la navbar quelle que soit la hauteur.
        minHeight: 'min(76vh, 780px)',
        paddingTop: 'clamp(104px, 14vh, 168px)',
        paddingBottom: 'clamp(40px, 7vh, 88px)',
        boxSizing: 'border-box',
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
          // Marge gauche fluide : 24px sur mobile, jusqu'à 56px au-delà.
          // Un padding fixe écrasait le titre sur les petits écrans.
          padding: '0 clamp(24px, 5vw, 56px) 24px',
        }}
        className="hero-content"
      >
        {/* H1 — serif éditorial (charte v2.0) */}
        <m.h1
          {...fu(0.1)}
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
          {c.titleLine1}
          <br />
          {c.titleLine2Pre}{' '}
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
            {c.titleWord}
          </span>
          <span style={{ color: brand.ink }}>.</span>
        </m.h1>

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
          {c.subtitle}
        </m.p>

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
            {c.ctaPrimary}
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
            {c.ctaSecondary}
          </a>
        </m.div>

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
            <strong style={{ color: brand.ink, fontWeight: 700 }}>{c.trialBold}</strong>
            {c.trialRest}
          </span>
        </m.p>
      </div>

      <style>{`
        /* La HAUTEUR du hero n'est plus décidée ici : sur l'accueil c'est
           la classe .nw-fold (globals.css) qui la donne, pour que la ligne
           de flottaison tombe pile sous la bande de garanties. Ne restent
           que les respirations, qui dépendent de la place disponible. */
        @media (max-height: 800px) {
          .hero-section { padding-top: 112px; padding-bottom: 36px; }
        }
        @media (max-width: 640px) {
          .hero-content h1 { max-width: 100% !important; }
        }
      `}</style>
    </section>
  )
}
