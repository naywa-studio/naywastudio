"use client"
import { m } from "framer-motion"
import Link from "next/link"

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

const fu = (delay: number) => ({
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true },
  transition: { duration: 0.65, delay, ease: EASE },
})

const agents = [
  {
    number: "01",
    name: "Léo",
    level: "Essentiel",
    badge: undefined,
    color: "#3B82F6",
    colorBg: "rgba(59,130,246,0.06)",
    colorBorder: "rgba(59,130,246,0.18)",
    headline: "Recherche de profils LinkedIn en quelques minutes",
    desc: "Décrivez le poste. Léo interroge le web, récupère les profils publics et vous remet un tableur structuré, prêt à explorer.",
    keyPoint: "Sans compte LinkedIn. Sans scraping.",
    features: [
      "Recherche web de profils publics",
      "Tableur structuré livré rapidement",
      "Critères en langage naturel",
      "Export prêt à l'emploi",
    ],
  },
  {
    number: "02",
    name: "Nora",
    level: "Le plus demandé",
    badge: "Le plus demandé",
    color: "#7C63C8",
    colorBg: "rgba(124,99,200,0.06)",
    colorBorder: "rgba(124,99,200,0.22)",
    headline: "Sourcing complet + messages prêts à envoyer",
    desc: "Nora trie les profils, les score selon votre poste et rédige un message personnalisé pour chaque candidat prioritaire. Vous copiez, vous envoyez.",
    keyPoint: "Nora ne contacte jamais les candidats à votre place.",
    features: [
      "Scoring automatique des profils",
      "Shortlist priorisée et commentée",
      "Messages personnalisés par candidat",
      "Copier-coller direct",
    ],
  },
  {
    number: "03",
    name: "Alex",
    level: "Premium",
    badge: undefined,
    color: "#7C3AED",
    colorBg: "rgba(124,58,237,0.06)",
    colorBorder: "rgba(124,58,237,0.18)",
    headline: "Pipeline complet jusqu'au rendez-vous",
    desc: "Alex gère le sourcing, le scoring, les messages et suit chaque candidat jusqu'à la réservation d'un créneau. Tout se passe dans votre workspace Nawa.",
    keyPoint: "Lien de réservation unique par candidat. Connecté à votre Calendly.",
    features: [
      "Sourcing → scoring → messages → booking",
      "Suivi par candidat en temps réel",
      "Lien de réservation Calendly intégré",
      "Pipeline complet dans votre workspace",
    ],
  },
] as const

export function AgentsPreview() {
  return (
    <section
      style={{
        background: "rgba(248,246,255,0.35)",
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
            marginBottom: 72,
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
            Package Sourcing
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
            3 niveaux d&apos;autonomie
          </h2>

          <p
            style={{
              fontFamily: "var(--font-inter), sans-serif",
              fontSize: 15,
              color: "#6B7280",
              lineHeight: 1.7,
              margin: 0,
              maxWidth: "48ch",
            }}
          >
            Choisissez le niveau qui correspond à votre organisation.
            Évoluez d&apos;un niveau à l&apos;autre sans interruption.
          </p>
        </m.div>

        {/* Agent cards */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(296px, 1fr))",
            gap: 20,
          }}
        >
          {agents.map(({ number, name, level, color, colorBg, colorBorder, headline, desc, keyPoint, features, badge }, i) => (
            <m.div
              key={number}
              {...fu(0.1 + i * 0.1)}
              style={{
                position: "relative",
                background: "#FFFFFF",
                border: `1px solid ${colorBorder}`,
                borderRadius: 18,
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
                transition: "box-shadow 200ms, transform 200ms",
              }}
              whileHover={{ y: -4, boxShadow: `0 12px 40px rgba(0,0,0,0.08), 0 2px 8px ${colorBg.replace("0.06", "0.12")}` }}
            >
              {/* Top accent bar */}
              <div style={{ height: 3, background: `linear-gradient(90deg, ${color}, transparent)` }} />

              {/* Card body */}
              <div style={{ padding: "28px 28px 32px", display: "flex", flexDirection: "column", gap: 20, flex: 1 }}>

                {/* Header row */}
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: "50%",
                        background: colorBg,
                        border: `1px solid ${colorBorder}`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 12,
                        fontWeight: 700,
                        color,
                        fontFamily: "var(--font-space-grotesk), sans-serif",
                        flexShrink: 0,
                      }}
                    >
                      {number}
                    </div>
                    <div>
                      <p
                        style={{
                          margin: 0,
                          fontFamily: "var(--font-space-grotesk), sans-serif",
                          fontSize: 20,
                          fontWeight: 700,
                          color: "#111827",
                          letterSpacing: "-0.02em",
                          lineHeight: 1.2,
                        }}
                      >
                        {name}
                      </p>
                    </div>
                  </div>

                  {badge ? (
                    <span
                      style={{
                        background: color,
                        color: "white",
                        fontSize: 10,
                        fontWeight: 700,
                        padding: "4px 10px",
                        borderRadius: 100,
                        letterSpacing: "0.04em",
                        textTransform: "uppercase" as const,
                        flexShrink: 0,
                        fontFamily: "var(--font-inter), sans-serif",
                      }}
                    >
                      {level}
                    </span>
                  ) : (
                    <span
                      style={{
                        background: colorBg,
                        border: `1px solid ${colorBorder}`,
                        color,
                        fontSize: 10,
                        fontWeight: 600,
                        padding: "4px 10px",
                        borderRadius: 100,
                        letterSpacing: "0.04em",
                        textTransform: "uppercase" as const,
                        flexShrink: 0,
                        fontFamily: "var(--font-inter), sans-serif",
                      }}
                    >
                      {level}
                    </span>
                  )}
                </div>

                {/* Headline */}
                <p
                  style={{
                    margin: 0,
                    fontFamily: "var(--font-space-grotesk), sans-serif",
                    fontSize: 15,
                    fontWeight: 700,
                    color: "#111827",
                    lineHeight: 1.4,
                  }}
                >
                  {headline}
                </p>

                {/* Description */}
                <p
                  style={{
                    margin: 0,
                    fontFamily: "var(--font-inter), sans-serif",
                    fontSize: 13.5,
                    color: "#4B5563",
                    lineHeight: 1.7,
                  }}
                >
                  {desc}
                </p>

                {/* Divider */}
                <div style={{ height: 1, background: "#F0ECF8" }} />

                {/* Feature list */}
                <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 9, flex: 1 }}>
                  {features.map((feature) => (
                    <li
                      key={feature}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 9,
                        fontFamily: "var(--font-inter), sans-serif",
                        fontSize: 13,
                        color: "#374151",
                      }}
                    >
                      <span
                        style={{
                          width: 16,
                          height: 16,
                          borderRadius: "50%",
                          background: colorBg,
                          border: `1px solid ${colorBorder}`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                          <path d="M1.5 4L3.5 6L6.5 2" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </span>
                      {feature}
                    </li>
                  ))}
                </ul>

                {/* Key point callout */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "9px 12px",
                    borderRadius: 9,
                    background: colorBg,
                    border: `1px solid ${colorBorder}`,
                  }}
                >
                  <span style={{ fontSize: 13, flexShrink: 0 }}>💡</span>
                  <p
                    style={{
                      margin: 0,
                      fontFamily: "var(--font-inter), sans-serif",
                      fontSize: 12,
                      fontWeight: 600,
                      color,
                      lineHeight: 1.45,
                    }}
                  >
                    {keyPoint}
                  </p>
                </div>

              </div>
            </m.div>
          ))}
        </div>

        {/* Trust line */}
        <m.p
          {...fu(0.4)}
          style={{
            textAlign: "center",
            marginTop: 28,
            fontSize: 13,
            color: "#6B7280",
            fontFamily: "var(--font-inter), sans-serif",
            fontStyle: "italic",
          }}
        >
          Nawa ne prend jamais contact avec les candidats à votre place.
        </m.p>

        {/* CTA */}
        <m.div
          {...fu(0.48)}
          style={{ textAlign: "center", marginTop: 24 }}
        >
          <Link
            href="/catalogue"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: "#7C63C8",
              color: "white",
              padding: "14px 30px",
              borderRadius: 12,
              fontSize: 14,
              fontWeight: 600,
              textDecoration: "none",
              fontFamily: "var(--font-inter), sans-serif",
              transition: "all 200ms cubic-bezier(0.22, 1, 0.36, 1)",
              boxShadow: "0 1px 2px rgba(0,0,0,0.06), 0 6px 20px rgba(124,99,200,0.22)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "#6B54B2"
              e.currentTarget.style.transform = "translateY(-2px)"
              e.currentTarget.style.boxShadow = "0 2px 4px rgba(0,0,0,0.08), 0 12px 32px rgba(124,99,200,0.36)"
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "#7C63C8"
              e.currentTarget.style.transform = "translateY(0)"
              e.currentTarget.style.boxShadow = "0 1px 2px rgba(0,0,0,0.06), 0 6px 20px rgba(124,99,200,0.22)"
            }}
          >
            Voir le catalogue complet
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2.5 7H11.5M7.5 3L11.5 7L7.5 11" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        </m.div>

      </div>
    </section>
  )
}
