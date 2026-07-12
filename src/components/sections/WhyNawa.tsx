"use client"
import { m } from "framer-motion"
import { useLanguage } from "@/lib/i18n/LanguageContext"

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

const fu = (delay: number) => ({
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true },
  transition: { duration: 0.65, delay, ease: EASE },
})

const content = {
  fr: {
    badge: "Notre proposition de valeur",
    titleLine1: "Trois principes,",
    titleLine2: "aucune fausse promesse.",
    intro:
      "Naywa n'automatise pas votre métier. Nous l'outillons pour que vous gardiez la main là où ça compte, et que la machine absorbe ce qui n'aurait jamais dû être à votre charge.",
    metrics: [
      {
        value: "Vous",
        title: "Vous gardez la décision",
        desc: "Aucun envoi, aucun classement, aucune action automatique. Nora propose, vous tranchez. Vos process, votre style, vos clients.",
      },
      {
        value: "IA",
        title: "L'IA absorbe la friction",
        desc: "Parsing, indexation, scoring justifié, anonymisation, calcul de marge : tout ce qui vous prenait des heures se fait pendant que vous lisez ce paragraphe.",
      },
      {
        value: "Métier",
        title: "Conçu pour le métier",
        desc: "Naywa ne cherche pas à tout faire. Nous bâtissons un outil par métier, en profondeur, avec les structures qui le vivent au quotidien.",
      },
    ],
  },
  en: {
    badge: "Our value proposition",
    titleLine1: "Three principles,",
    titleLine2: "no false promises.",
    intro:
      "Naywa doesn't automate your job. We equip you to stay in control where it matters, while the machine absorbs what should never have been your burden.",
    metrics: [
      {
        value: "You",
        title: "You keep the decision",
        desc: "No sending, no sorting, no automatic action. Nora suggests, you decide. Your process, your style, your clients.",
      },
      {
        value: "AI",
        title: "AI absorbs the friction",
        desc: "Parsing, indexing, justified scoring, anonymization, margin calculation: everything that used to take you hours happens while you read this paragraph.",
      },
      {
        value: "Craft",
        title: "Built for the craft",
        desc: "Naywa isn't trying to do everything. We build one tool per profession, in depth, with the teams who live it every day.",
      },
    ],
  },
}

export function WhyNawa() {
  const { lang } = useLanguage()
  const c = content[lang]
  const metrics = c.metrics
  return (
    <section
      style={{
        background: "transparent",
        padding: "112px 24px",
        borderTop: "1px solid rgba(240,236,248,0.6)",
        position: "relative",
      }}
    >
      <div style={{ maxWidth: 1040, margin: "0 auto" }}>

        {/* Section header */}
        <m.div
          {...fu(0)}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
            marginBottom: 80,
            gap: 16,
          }}
        >
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              background: "rgba(124,99,200,0.07)",
              border: "1px solid rgba(124,99,200,0.18)",
              borderRadius: 100,
              padding: "5px 14px",
              fontSize: 11,
              fontWeight: 600,
              color: "#7C63C8",
              letterSpacing: "0.09em",
              textTransform: "uppercase" as const,
              fontFamily: "var(--font-inter), sans-serif",
            }}
          >
            {c.badge}
          </span>

          <h2
            style={{
              fontFamily: "var(--font-space-grotesk), sans-serif",
              fontSize: "clamp(28px, 3.8vw, 46px)",
              fontWeight: 800,
              color: "#111827",
              letterSpacing: "-0.025em",
              lineHeight: 1.12,
              margin: 0,
              maxWidth: "22ch",
            }}
          >
            {c.titleLine1}<br />
            {c.titleLine2}
          </h2>

          <p
            style={{
              fontFamily: "var(--font-inter), sans-serif",
              fontSize: 15,
              color: "#6B7280",
              lineHeight: 1.7,
              margin: 0,
              maxWidth: "50ch",
            }}
          >
            {c.intro}
          </p>
        </m.div>

        {/* Metrics row */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          }}
        >
          {metrics.map(({ value, title, desc }, i) => (
            <m.div
              key={value}
              {...fu(0.1 + i * 0.1)}
              style={{
                padding: "44px 40px",
                borderTop: "3px solid transparent",
                borderImage: "linear-gradient(90deg, #7C63C8, #B8AEDE) 1",
                display: "flex",
                flexDirection: "column",
                gap: 14,
                position: "relative",
              }}
            >
              {/* Subtle separator between items (not after last) */}
              {i < metrics.length - 1 && (
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    right: 0,
                    width: 1,
                    height: "100%",
                    background: "linear-gradient(to bottom, transparent, #E2DAF6 30%, #E2DAF6 70%, transparent)",
                  }}
                />
              )}

              {/* Big metric */}
              <div
                style={{
                  fontFamily: "var(--font-space-grotesk), sans-serif",
                  fontSize: "clamp(56px, 6.5vw, 80px)",
                  fontWeight: 800,
                  color: "#7C63C8",
                  lineHeight: 1,
                  letterSpacing: "-0.04em",
                }}
              >
                {value}
              </div>

              {/* Title */}
              <p
                style={{
                  margin: 0,
                  fontFamily: "var(--font-space-grotesk), sans-serif",
                  fontSize: 17,
                  fontWeight: 700,
                  color: "#111827",
                  letterSpacing: "-0.01em",
                }}
              >
                {title}
              </p>

              {/* Description */}
              <p
                style={{
                  margin: 0,
                  fontFamily: "var(--font-inter), sans-serif",
                  fontSize: 14,
                  color: "#6B7280",
                  lineHeight: 1.7,
                }}
              >
                {desc}
              </p>
            </m.div>
          ))}
        </div>

      </div>
    </section>
  )
}
