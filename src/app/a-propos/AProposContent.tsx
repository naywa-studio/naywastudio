"use client"

import Link from "next/link"
import { Founders } from "@/components/sections/Founders"
import { useLanguage } from "@/lib/i18n/LanguageContext"
import { Eyebrow } from "@/components/brand/Eyebrow"

const content = {
  fr: {
    badge: "À propos de Naywa Studio",
    titlePre: "Nous traitons, ",
    titleItalic: "vous décidez",
    titleSuffix: ".",
    intro1: "Naywa Studio conçoit des packages qui outillent un métier en profondeur.",
    introBold: " Nous traitons. Vous décidez.",
    intro2: " Notre premier package est dédié au sourcing : ",
    introNora: "Nora",
    intro3: ", l'assistante qui lit vos CV, range votre vivier, note chaque candidat sur vos missions et prépare vos shortlists, sans jamais agir à votre place.",
    pillars: [
      {
        title: "L'IA propose, jamais elle ne décide",
        body: "Nora suggère des scores, des relances, des messages d'approche. Aucune action n'est déclenchée sans approbation explicite du sourceur. Vous gardez la main sur chaque mouvement candidat.",
      },
      {
        title: "Un produit fait à taille humaine",
        body: "Le produit, le code, le design, le pricing : tout passe entre les mains de l'équipe fondatrice. Vous échangez avec les personnes qui conçoivent le produit, pas avec un support de niveau 1.",
      },
      {
        title: "Vos données restent à vous",
        body: "Vos données sont hébergées en Europe et chiffrées. Chaque organisation est cloisonnée : aucune donnée ne passe de l'une à l'autre, jamais. Vous pouvez exporter ou supprimer votre vivier à tout moment.",
      },
    ],
    ctaTitle: "Une question ou envie d'essayer ?",
    ctaDesc: "On répond personnellement à chaque message. 15 jours d'essai offerts, sans engagement.",
    ctaPrimary: "Créer mon organisation",
    ctaSecondary: "Nous contacter",
  },
  en: {
    badge: "About Naywa Studio",
    titlePre: "We handle it, ",
    titleItalic: "you decide",
    titleSuffix: ".",
    intro1: "Naywa Studio builds packages that equip one profession, in depth.",
    introBold: " We handle it. You decide.",
    intro2: " Our first package is built for sourcing: ",
    introNora: "Nora",
    intro3: ", the assistant that reads your CVs, organizes your talent pool, scores every candidate against your roles and prepares your shortlists, without ever acting in your place.",
    pillars: [
      {
        title: "AI suggests. It never decides.",
        body: "Nora suggests scores, follow-ups, and outreach messages. No action is ever triggered without the recruiter's explicit approval. You stay in control of every candidate move.",
      },
      {
        title: "A small, hands-on product",
        body: "The product, the code, the design, the pricing: everything goes through the founding team's hands. You talk to the people who design the product, not to tier-1 support.",
      },
      {
        title: "Your data stays yours",
        body: "Your data is hosted in Europe and encrypted. Every organization is walled off: no data ever moves from one to another. You can export or delete your talent pool at any time.",
      },
    ],
    ctaTitle: "A question, or want to try it out?",
    ctaDesc: "We personally reply to every message. 15 days free trial, no commitment.",
    ctaPrimary: "Create my organization",
    ctaSecondary: "Contact us",
  },
}

const PILLAR_ICONS = [
  <>
    <circle key="c" cx="12" cy="12" r="9" />
    <polyline points="9 12 11 14 15 10" />
  </>,
  <>
    <path d="M16 11a4 4 0 1 0-8 0c0 1.7.9 3.2 2.3 4l-2.1 7h7.6l-2.1-7c1.4-.8 2.3-2.3 2.3-4z" />
  </>,
  <>
    <path d="M12 2 4 6v6c0 5 3.4 9.4 8 10 4.6-.6 8-5 8-10V6l-8-4z" />
  </>,
]

export function AProposContent() {
  const { lang } = useLanguage()
  const c = content[lang]

  return (
    <main style={{ position: "relative", zIndex: 1, paddingTop: 120 }}>
      {/* Hero */}
      <section style={{ padding: "0 24px 56px" }}>
        <div style={{ maxWidth: 780, margin: "0 auto" }}>
          <Eyebrow n="01">{c.badge}</Eyebrow>
          <h1
            style={{
              fontFamily: "var(--font-fraunces), serif",
              fontSize: "clamp(32px, 4.6vw, 52px)",
              fontWeight: 800,
              color: "#111827",
              margin: "12px 0 18px",
              lineHeight: 1.05,
              letterSpacing: "-0.025em",
            }}
          >
            {c.titlePre}
            <span
              style={{
                fontFamily: "var(--font-instrument-serif), serif",
                fontWeight: 400,
                fontStyle: "italic",
                color: "#7C63C8",
              }}
            >
              {c.titleItalic}
            </span>
            {c.titleSuffix}
          </h1>
          <p
            style={{
              fontFamily: "var(--font-inter), sans-serif",
              fontSize: 17,
              color: "#4B5563",
              lineHeight: 1.7,
              margin: 0,
              maxWidth: "60ch",
            }}
          >
            {c.intro1}
            <strong>{c.introBold}</strong>
            {c.intro2}
            <strong>{c.introNora}</strong>
            {c.intro3}
          </p>
        </div>
      </section>

      {/* Pillars */}
      <section style={{ padding: "0 24px 80px" }}>
        <div style={{ maxWidth: 980, margin: "0 auto" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gap: 18,
            }}
            className="a-propos-pillars"
          >
            {c.pillars.map((p, i) => (
              <article
                key={p.title}
                style={{
                  background: "white",
                  border: "1px solid #F0ECF8",
                  borderRadius: 18,
                  padding: "26px 22px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                  boxShadow: "0 4px 16px rgba(124,99,200,0.05)",
                }}
              >
                <div
                  aria-hidden
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 11,
                    background: "linear-gradient(135deg, #F0ECF8 0%, #E2DAF6 100%)",
                    border: "1px solid rgba(124,99,200,0.30)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#7C63C8",
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    {PILLAR_ICONS[i]}
                  </svg>
                </div>
                <h2
                  style={{
                    fontFamily: "var(--font-fraunces), serif",
                    margin: 0,
                    fontSize: 16,
                    fontWeight: 700,
                    color: "#111827",
                    letterSpacing: "-0.01em",
                  }}
                >
                  {p.title}
                </h2>
                <p
                  style={{
                    fontFamily: "var(--font-inter), sans-serif",
                    margin: 0,
                    fontSize: 14,
                    color: "#4B5563",
                    lineHeight: 1.6,
                  }}
                >
                  {p.body}
                </p>
              </article>
            ))}
          </div>
        </div>

        <style>{`
          @media (max-width: 880px) {
            .a-propos-pillars { grid-template-columns: 1fr 1fr !important; }
          }
          @media (max-width: 560px) {
            .a-propos-pillars { grid-template-columns: 1fr !important; }
          }
        `}</style>
      </section>

      {/* Founders section reused from the homepage */}
      <Founders />

      {/* Final CTA */}
      <section style={{ padding: "96px 24px 112px", background: "white", borderTop: "1px solid #F0ECF8" }}>
        <div style={{ maxWidth: 720, margin: "0 auto", textAlign: "center" }}>
          <h2
            style={{
              fontFamily: "var(--font-fraunces), serif",
              fontSize: "clamp(24px, 3.4vw, 36px)",
              fontWeight: 800,
              color: "#111827",
              margin: "0 0 16px",
              lineHeight: 1.15,
              letterSpacing: "-0.02em",
            }}
          >
            {c.ctaTitle}
          </h2>
          <p
            style={{
              fontFamily: "var(--font-inter), sans-serif",
              fontSize: 15.5,
              color: "#4B5563",
              lineHeight: 1.7,
              margin: "0 0 28px",
            }}
          >
            {c.ctaDesc}
          </p>
          <div
            style={{
              display: "inline-flex",
              gap: 10,
              flexWrap: "wrap",
              justifyContent: "center",
            }}
          >
            <Link
              href="/login?mode=signup"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background: "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)",
                color: "white",
                borderRadius: 12,
                padding: "13px 26px",
                fontFamily: "var(--font-inter), sans-serif",
                fontSize: 14.5,
                fontWeight: 700,
                textDecoration: "none",
                boxShadow: "0 6px 20px -6px rgba(124,99,200,0.55)",
              }}
            >
              {c.ctaPrimary}
            </Link>
            <Link
              href="/contact"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                borderRadius: 12,
                padding: "13px 24px",
                border: "1px solid #E2DAF6",
                background: "white",
                color: "#4B5563",
                fontFamily: "var(--font-inter), sans-serif",
                fontSize: 14.5,
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              {c.ctaSecondary}
            </Link>
          </div>
        </div>
      </section>
    </main>
  )
}
