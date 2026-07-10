"use client"
import { m } from "framer-motion"

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

const fu = (delay: number) => ({
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true },
  transition: { duration: 0.65, delay, ease: EASE },
})

const steps = [
  {
    number: "01",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM22 11h-6M19 8v6" stroke="#7C63C8" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    title: "Importez vos CVs",
    subtitle: "Drag-drop",
    desc: "Glissez vos PDFs — même les CVs scannés (OCR intégré). Nora extrait les compétences, l'expérience et les coordonnées, puis classe chaque candidat dans son secteur.",
  },
  {
    number: "02",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke="#7C63C8" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    title: "Décrivez vos missions",
    subtitle: "1 minute par mission",
    desc: "Brief court : titre, lieu, compétences, séniorité. Nora score immédiatement tous les CVs de votre vivier contre cette mission.",
  },
  {
    number: "03",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" stroke="#7C63C8" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    title: "Présentez votre shortlist",
    subtitle: "Anonymisée si vous voulez",
    desc: "Pour chaque mission, votre top candidats triés et justifiés. Génère un PDF anonymisé en 1 clic pour vos clients, suit la prise de contact dans le pipeline.",
  },
]

export function HowItWorks() {
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
            Comment ça marche
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
            }}
          >
            Votre vivier, organisé<br />
            et matché par Nora
          </h2>

          <p
            style={{
              fontFamily: "var(--font-inter), sans-serif",
              fontSize: 15,
              color: "#6B7280",
              lineHeight: 1.7,
              margin: 0,
              maxWidth: "46ch",
            }}
          >
            Trois étapes simples entre votre premier contact et vos premiers candidats qualifiés.
          </p>
        </m.div>

        {/* Steps */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 0,
            position: "relative",
          }}
        >
          {steps.map(({ number, icon, title, subtitle, desc }, i) => (
            <m.div
              key={number}
              {...fu(0.1 + i * 0.12)}
              style={{
                padding: "40px 36px",
                position: "relative",
                display: "flex",
                flexDirection: "column",
                gap: 20,
              }}
            >
              {/* Connector line (not after last) */}
              {i < steps.length - 1 && (
                <div
                  aria-hidden
                  style={{
                    position: "absolute",
                    top: 52,
                    right: -1,
                    width: 1,
                    height: 60,
                    background: "linear-gradient(to bottom, #E2DAF6, transparent)",
                  }}
                />
              )}

              {/* Icon + number row */}
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 14,
                    background: "rgba(124,99,200,0.07)",
                    border: "1px solid rgba(124,99,200,0.16)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  {icon}
                </div>

                <div>
                  <p
                    style={{
                      margin: 0,
                      fontFamily: "var(--font-space-grotesk), sans-serif",
                      fontSize: 11,
                      fontWeight: 600,
                      color: "#6B7280",
                      letterSpacing: "0.08em",
                      textTransform: "uppercase" as const,
                    }}
                  >
                    Étape {number}
                  </p>
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 3 }}>
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background: "#7C63C8",
                        boxShadow: "0 0 6px rgba(124,99,200,0.7)",
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        fontFamily: "var(--font-inter), sans-serif",
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#7C63C8",
                      }}
                    >
                      {subtitle}
                    </span>
                  </div>
                </div>
              </div>

              {/* Text content */}
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <h3
                  style={{
                    margin: 0,
                    fontFamily: "var(--font-space-grotesk), sans-serif",
                    fontSize: 19,
                    fontWeight: 700,
                    color: "#111827",
                    letterSpacing: "-0.015em",
                    lineHeight: 1.25,
                  }}
                >
                  {title}
                </h3>
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
              </div>
            </m.div>
          ))}
        </div>

      </div>
    </section>
  )
}
