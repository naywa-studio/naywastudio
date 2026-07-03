"use client"
import { m } from "framer-motion"

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

const fu = (delay: number) => ({
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true },
  transition: { duration: 0.65, delay, ease: EASE },
})

const metrics = [
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
]

export function WhyNawa() {
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
            Notre proposition de valeur
          </span>

          <h2
            style={{
              fontFamily: "var(--font-space-grotesk), sans-serif",
              fontSize: "clamp(28px, 3.8vw, 46px)",
              fontWeight: 700,
              color: "#111827",
              letterSpacing: "-0.025em",
              lineHeight: 1.12,
              margin: 0,
              maxWidth: "22ch",
            }}
          >
            Trois principes,<br />
            aucune fausse promesse.
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
            Naywa n&apos;automatise pas votre métier. Nous l&apos;outillons
            pour que vous gardiez la main là où ça compte, et que la machine
            absorbe ce qui n&apos;aurait jamais dû être à votre charge.
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
                  fontWeight: 700,
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
