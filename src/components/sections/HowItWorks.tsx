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
        <path d="M9 12h6M9 8h4M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" stroke="#7C63C8" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    title: "Décrivez votre besoin",
    subtitle: "2 minutes",
    desc: "Répondez à 3 questions sur votre volume, votre objectif et votre niveau d'autonomie souhaité. Notre quiz guide la recommandation.",
  },
  {
    number: "02",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="3" stroke="#7C63C8" strokeWidth="1.75" />
        <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.64 5.64l1.42 1.42M16.95 16.95l1.41 1.41M5.64 18.36l1.42-1.42M16.95 7.05l1.41-1.41" stroke="#7C63C8" strokeWidth="1.75" strokeLinecap="round" />
      </svg>
    ),
    title: "On configure votre agent",
    subtitle: "Sous 48h",
    desc: "Notre équipe paramètre l'agent selon votre contexte — offres, critères, ton de communication. Aucune intégration technique requise.",
  },
  {
    number: "03",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M13 10V3L4 14h7v7l9-11h-7z" stroke="#7C63C8" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    title: "Votre agent travaille",
    subtitle: "En continu",
    desc: "L'agent source, trie et qualifie vos candidats 24h/24. Vous recevez une shortlist commentée, prête à l'action.",
  },
]

export function HowItWorks() {
  return (
    <section
      style={{
        background: "#FFFFFF",
        padding: "112px 24px",
        borderTop: "1px solid #F0ECF8",
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
            Opérationnel en 48h,<br />
            sans friction
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
                {/* Icon container */}
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

                {/* Step number + subtitle */}
                <div>
                  <p
                    style={{
                      margin: 0,
                      fontFamily: "var(--font-space-grotesk), sans-serif",
                      fontSize: 11,
                      fontWeight: 600,
                      color: "#9CA3AF",
                      letterSpacing: "0.08em",
                      textTransform: "uppercase" as const,
                    }}
                  >
                    Étape {number}
                  </p>
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      marginTop: 3,
                    }}
                  >
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
