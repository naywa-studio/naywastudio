"use client"
import { m } from "framer-motion"
import { Logo } from "@/components/ui/Logo"
import Link from "next/link"

/* ─── Data ────────────────────────────────────────────────────── */

const LEVELS = [
  {
    number: "01",
    label: "Essentiel",
    agentName: "Léo",
    agentRole: "Sourcing de profils publics",
    color: "#3B82F6",
    colorLight: "rgba(59,130,246,0.06)",
    colorMid: "rgba(59,130,246,0.12)",
    borderColor: "rgba(59,130,246,0.22)",
    headline: "Recherche de profils LinkedIn en quelques minutes",
    description:
      "Décrivez le poste. Léo interroge le web, récupère les profils publics et vous remet un tableur structuré, prêt à explorer.",
    keyPoint: "Sans compte LinkedIn. Sans scraping.",
    features: [
      "Recherche web de profils publics",
      "Tableur structuré livré rapidement",
      "Critères en langage naturel",
      "Export prêt à l'emploi",
    ],
    badge: null,
  },
  {
    number: "02",
    label: "Le plus demandé",
    agentName: "Nora",
    agentRole: "Sourcing complet + messages",
    color: "#7C63C8",
    colorLight: "rgba(124,99,200,0.06)",
    colorMid: "rgba(124,99,200,0.12)",
    borderColor: "rgba(124,99,200,0.25)",
    headline: "Sourcing complet + messages prêts à envoyer",
    description:
      "Nora trie les profils, les score selon votre poste et rédige un message personnalisé pour chaque candidat prioritaire. Vous copiez, vous envoyez.",
    keyPoint: "Nora ne contacte jamais les candidats à votre place.",
    features: [
      "Scoring automatique des profils",
      "Shortlist priorisée et commentée",
      "Messages personnalisés par candidat",
      "Copier-coller direct",
    ],
    badge: "Le plus demandé",
  },
  {
    number: "03",
    label: "Premium",
    agentName: "Alex",
    agentRole: "Pipeline complet jusqu'au rendez-vous",
    color: "#7C3AED",
    colorLight: "rgba(124,58,237,0.06)",
    colorMid: "rgba(124,58,237,0.12)",
    borderColor: "rgba(124,58,237,0.22)",
    headline: "Pipeline complet jusqu'au rendez-vous",
    description:
      "Alex gère le sourcing, le scoring, les messages et suit chaque candidat jusqu'à la réservation d'un créneau. Tout se passe dans votre workspace Nawa.",
    keyPoint: "Lien de réservation unique par candidat. Connecté à votre Calendly.",
    features: [
      "Sourcing → scoring → messages → booking",
      "Suivi par candidat en temps réel",
      "Lien de réservation Calendly intégré",
      "Pipeline complet dans votre workspace",
    ],
    badge: "Premium",
  },
] as const

/* ─── Comparison table data ───────────────────────────────────── */

const COMPARISON_ROWS = [
  { feature: "Recherche de profils publics", leo: true, nora: true, alex: true },
  { feature: "Export tableur structuré", leo: true, nora: true, alex: true },
  { feature: "Scoring et priorisation des profils", leo: false, nora: true, alex: true },
  { feature: "Shortlist commentée", leo: false, nora: true, alex: true },
  { feature: "Messages personnalisés par candidat", leo: false, nora: true, alex: true },
  { feature: "Suivi par candidat en temps réel", leo: false, nora: false, alex: true },
  { feature: "Lien de réservation Calendly intégré", leo: false, nora: false, alex: true },
  { feature: "Pipeline complet dans le workspace", leo: false, nora: false, alex: true },
]

/* ─── Animations ──────────────────────────────────────────────── */

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

const fu = (delay: number) => ({
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true },
  transition: { duration: 0.65, delay, ease: EASE },
})

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, delay: i * 0.12, ease: EASE },
  }),
}

/* ─── Page ────────────────────────────────────────────────────── */

export default function CataloguePage() {
  return (
    <div style={{ background: "#FAFAFA", minHeight: "100vh" }}>
      {/* Navbar */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 40,
          background: "rgba(255,255,255,0.92)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid #F0ECF8",
          padding: "0 24px",
          height: 64,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Link href="/" style={{ textDecoration: "none" }}>
          <Logo size="md" />
        </Link>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <Link
            href="/workspace"
            style={{
              fontSize: 14,
              fontWeight: 500,
              color: "#7C63C8",
              textDecoration: "none",
              padding: "8px 16px",
              borderRadius: 8,
              border: "1.5px solid #E2DAF6",
              transition: "all 150ms",
            }}
          >
            Mon espace
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section style={{ padding: "80px 24px 40px", textAlign: "center", maxWidth: 800, margin: "0 auto" }}>
        <m.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <span
            style={{
              display: "inline-block",
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: 1.5,
              textTransform: "uppercase",
              color: "#7C63C8",
              background: "#F0ECF8",
              padding: "6px 16px",
              borderRadius: 100,
              marginBottom: 24,
              fontFamily: "var(--font-inter), sans-serif",
            }}
          >
            Catalogue
          </span>
          <h1
            style={{
              fontFamily: "var(--font-space-grotesk), sans-serif",
              fontSize: "clamp(32px, 5vw, 52px)",
              fontWeight: 800,
              color: "#111827",
              lineHeight: 1.15,
              margin: "0 0 20px",
              letterSpacing: -0.5,
            }}
          >
            Package Sourcing
          </h1>
          <p
            style={{
              fontFamily: "var(--font-inter), sans-serif",
              fontSize: "clamp(16px, 2vw, 19px)",
              color: "#6B7280",
              lineHeight: 1.65,
              maxWidth: 600,
              margin: "0 auto",
            }}
          >
            3 niveaux d&apos;autonomie. Choisissez celui qui correspond à votre organisation.
            Évoluez d&apos;un niveau à l&apos;autre sans interruption.
          </p>
        </m.div>
      </section>

      {/* Level progression indicator */}
      <section style={{ padding: "20px 24px 80px", maxWidth: 1200, margin: "0 auto" }}>
        <m.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 0,
            marginBottom: 48,
          }}
        >
          {LEVELS.map((level, i) => (
            <div key={level.number} style={{ display: "flex", alignItems: "center" }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: "50%",
                  background: level.color,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 14,
                  fontWeight: 700,
                  color: "white",
                  boxShadow: `0 0 0 4px ${level.colorMid}`,
                  fontFamily: "var(--font-space-grotesk), sans-serif",
                }}
              >
                {level.number}
              </div>
              {i < LEVELS.length - 1 && (
                <div
                  style={{
                    width: 80,
                    height: 2,
                    background: `linear-gradient(90deg, ${LEVELS[i].color}, ${LEVELS[i + 1].color})`,
                    opacity: 0.3,
                  }}
                />
              )}
            </div>
          ))}
        </m.div>

        {/* Cards grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: 24,
            alignItems: "stretch",
          }}
        >
          {LEVELS.map((level, i) => (
            <m.div
              key={level.number}
              custom={i}
              variants={fadeUp}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-50px" }}
              style={{
                position: "relative",
                background: "white",
                borderRadius: 20,
                border: `1.5px solid ${level.borderColor}`,
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
                transition: "box-shadow 200ms, transform 200ms",
              }}
              whileHover={{
                boxShadow: `0 12px 40px ${level.colorMid}`,
                y: -4,
              }}
            >
              {/* Top accent bar */}
              <div style={{ height: 3, background: `linear-gradient(90deg, ${level.color}, transparent)` }} />

              {/* Badge */}
              {level.badge && (
                <div
                  style={{
                    position: "absolute",
                    top: 20,
                    right: 20,
                    background: level.badge === "Le plus demandé" ? level.color : level.colorLight,
                    border: level.badge === "Le plus demandé" ? "none" : `1px solid ${level.borderColor}`,
                    color: level.badge === "Le plus demandé" ? "white" : level.color,
                    fontSize: 10,
                    fontWeight: 700,
                    padding: "4px 10px",
                    borderRadius: 100,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                    fontFamily: "var(--font-inter), sans-serif",
                  }}
                >
                  {level.badge}
                </div>
              )}

              <div style={{ padding: "28px 28px 32px", display: "flex", flexDirection: "column", gap: 20, flex: 1 }}>
                {/* Level header */}
                <div>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: "#9CA3AF",
                      fontFamily: "var(--font-inter), sans-serif",
                    }}
                  >
                    {level.number}
                  </span>
                  <h2
                    style={{
                      fontFamily: "var(--font-space-grotesk), sans-serif",
                      fontSize: 28,
                      fontWeight: 800,
                      color: "#111827",
                      margin: "8px 0 2px",
                      letterSpacing: -0.3,
                    }}
                  >
                    {level.agentName}
                  </h2>
                  <p
                    style={{
                      fontFamily: "var(--font-inter), sans-serif",
                      fontSize: 14,
                      color: "#6B7280",
                      margin: 0,
                      fontWeight: 500,
                    }}
                  >
                    {level.agentRole}
                  </p>
                </div>

                {/* Divider */}
                <div style={{ height: 1, background: level.borderColor }} />

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
                  {level.headline}
                </p>

                {/* Description */}
                <p
                  style={{
                    fontFamily: "var(--font-inter), sans-serif",
                    fontSize: 13.5,
                    color: "#4B5563",
                    lineHeight: 1.7,
                    margin: 0,
                  }}
                >
                  {level.description}
                </p>

                {/* Features */}
                <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 9, flex: 1 }}>
                  {level.features.map((feat) => (
                    <li
                      key={feat}
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
                          background: level.colorLight,
                          border: `1px solid ${level.borderColor}`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                          <path d="M1.5 4L3.5 6L6.5 2" stroke={level.color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </span>
                      {feat}
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
                    background: level.colorLight,
                    border: `1px solid ${level.borderColor}`,
                  }}
                >
                  <span style={{ fontSize: 13, flexShrink: 0 }}>💡</span>
                  <p
                    style={{
                      margin: 0,
                      fontFamily: "var(--font-inter), sans-serif",
                      fontSize: 12,
                      fontWeight: 600,
                      color: level.color,
                      lineHeight: 1.45,
                    }}
                  >
                    {level.keyPoint}
                  </p>
                </div>

                {/* CTA */}
                <Link
                  href="/signup"
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "center",
                    padding: "14px 24px",
                    borderRadius: 12,
                    fontWeight: 600,
                    fontSize: 15,
                    color: "white",
                    background: level.color,
                    textDecoration: "none",
                    transition: "opacity 150ms, transform 150ms",
                    fontFamily: "var(--font-inter), sans-serif",
                    boxShadow: `0 4px 16px ${level.colorMid}`,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.9"; e.currentTarget.style.transform = "translateY(-1px)" }}
                  onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.transform = "translateY(0)" }}
                >
                  Activer {level.agentName} →
                </Link>
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
      </section>

      {/* Comparison table */}
      <section
        style={{
          padding: "64px 24px",
          background: "#F8F6FF",
          borderTop: "1px solid #F0ECF8",
          borderBottom: "1px solid #F0ECF8",
        }}
      >
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <m.div
            {...fu(0)}
            style={{ textAlign: "center", marginBottom: 48 }}
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
                marginBottom: 16,
              }}
            >
              Comparaison
            </span>
            <h2
              style={{
                fontFamily: "var(--font-space-grotesk), sans-serif",
                fontSize: "clamp(22px, 3vw, 34px)",
                fontWeight: 800,
                color: "#111827",
                margin: "0 auto",
                letterSpacing: "-0.02em",
              }}
            >
              Ce qui est inclus à chaque niveau
            </h2>
          </m.div>

          <m.div {...fu(0.1)} style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--font-inter), sans-serif" }}>
              <thead>
                <tr>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "12px 16px",
                      fontSize: 12,
                      fontWeight: 600,
                      color: "#9CA3AF",
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      borderBottom: "2px solid #E5E7EB",
                      width: "46%",
                    }}
                  >
                    Fonctionnalité
                  </th>
                  {LEVELS.map((level) => (
                    <th
                      key={level.number}
                      style={{
                        textAlign: "center",
                        padding: "12px 16px",
                        borderBottom: "2px solid #E5E7EB",
                        width: "18%",
                      }}
                    >
                      <span
                        style={{
                          display: "inline-block",
                          fontSize: 13,
                          fontWeight: 700,
                          color: level.color,
                          fontFamily: "var(--font-space-grotesk), sans-serif",
                        }}
                      >
                        {level.agentName}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMPARISON_ROWS.map((row, i) => (
                  <tr
                    key={row.feature}
                    style={{
                      background: i % 2 === 0 ? "white" : "rgba(248,246,255,0.6)",
                    }}
                  >
                    <td
                      style={{
                        padding: "13px 16px",
                        fontSize: 13.5,
                        color: "#374151",
                        borderBottom: "1px solid #F3F4F6",
                      }}
                    >
                      {row.feature}
                    </td>
                    {(["leo", "nora", "alex"] as const).map((key) => (
                      <td
                        key={key}
                        style={{
                          textAlign: "center",
                          padding: "13px 16px",
                          borderBottom: "1px solid #F3F4F6",
                        }}
                      >
                        {row[key] ? (
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              width: 22,
                              height: 22,
                              borderRadius: "50%",
                              background: key === "leo"
                                ? "rgba(59,130,246,0.1)"
                                : key === "nora"
                                  ? "rgba(124,99,200,0.1)"
                                  : "rgba(124,58,237,0.1)",
                            }}
                          >
                            <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                              <path
                                d="M2 5.5L4.5 8L9 3"
                                stroke={key === "leo" ? "#3B82F6" : key === "nora" ? "#7C63C8" : "#7C3AED"}
                                strokeWidth="1.75"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </span>
                        ) : (
                          <span style={{ color: "#D1D5DB", fontSize: 16 }}>—</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </m.div>
        </div>
      </section>

      {/* How it works (simple) */}
      <section
        style={{
          padding: "64px 24px",
          borderBottom: "1px solid #F0ECF8",
        }}
      >
        <div style={{ maxWidth: 800, margin: "0 auto", textAlign: "center" }}>
          <m.h2
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            style={{
              fontFamily: "var(--font-space-grotesk), sans-serif",
              fontSize: 28,
              fontWeight: 700,
              color: "#111827",
              marginBottom: 48,
            }}
          >
            Comment ça fonctionne ?
          </m.h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: 32,
            }}
          >
            {[
              {
                step: "1",
                title: "Choisissez votre niveau",
                desc: "Sélectionnez le niveau d'autonomie adapté à vos besoins.",
              },
              {
                step: "2",
                title: "Votre workspace est prêt",
                desc: "Votre workspace est configuré automatiquement en moins de 24h. Aucune intégration technique requise.",
              },
              {
                step: "3",
                title: "Votre agent travaille",
                desc: "L'agent source, trie et qualifie vos candidats 24h/24. Vous recevez une shortlist commentée.",
              },
            ].map((item, i) => (
              <m.div
                key={item.step}
                custom={i}
                variants={fadeUp}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                style={{ textAlign: "center" }}
              >
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: "50%",
                    background: "#7C63C8",
                    color: "white",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 18,
                    fontWeight: 700,
                    margin: "0 auto 16px",
                    fontFamily: "var(--font-space-grotesk), sans-serif",
                  }}
                >
                  {item.step}
                </div>
                <h3
                  style={{
                    fontFamily: "var(--font-space-grotesk), sans-serif",
                    fontSize: 16,
                    fontWeight: 600,
                    color: "#111827",
                    marginBottom: 8,
                  }}
                >
                  {item.title}
                </h3>
                <p
                  style={{
                    fontFamily: "var(--font-inter), sans-serif",
                    fontSize: 14,
                    color: "#6B7280",
                    lineHeight: 1.6,
                    margin: 0,
                  }}
                >
                  {item.desc}
                </p>
              </m.div>
            ))}
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section style={{ padding: "64px 24px", textAlign: "center" }}>
        <m.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          style={{ maxWidth: 520, margin: "0 auto" }}
        >
          <h2
            style={{
              fontFamily: "var(--font-space-grotesk), sans-serif",
              fontSize: 24,
              fontWeight: 700,
              color: "#111827",
              marginBottom: 12,
            }}
          >
            Opérationnel en 48h, sans friction
          </h2>
          <p
            style={{
              fontFamily: "var(--font-inter), sans-serif",
              fontSize: 15,
              color: "#6B7280",
              marginBottom: 12,
            }}
          >
            Choisissez votre agent et démarrez en moins de 48h.
          </p>
          <p
            style={{
              fontFamily: "var(--font-inter), sans-serif",
              fontSize: 13,
              color: "#9CA3AF",
              fontStyle: "italic",
              marginBottom: 28,
            }}
          >
            Nawa ne prend jamais contact avec les candidats à votre place.
          </p>
          <Link
            href="/signup"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: "#7C63C8",
              color: "white",
              padding: "14px 30px",
              borderRadius: 12,
              fontSize: 15,
              fontWeight: 600,
              textDecoration: "none",
              fontFamily: "var(--font-inter), sans-serif",
              boxShadow: "0 4px 16px rgba(124,99,200,0.3)",
              transition: "all 200ms cubic-bezier(0.22, 1, 0.36, 1)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "#6B54B2"
              e.currentTarget.style.transform = "translateY(-2px)"
              e.currentTarget.style.boxShadow = "0 2px 4px rgba(0,0,0,0.08), 0 12px 32px rgba(124,99,200,0.36)"
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "#7C63C8"
              e.currentTarget.style.transform = "translateY(0)"
              e.currentTarget.style.boxShadow = "0 4px 16px rgba(124,99,200,0.3)"
            }}
          >
            Créer mon espace →
          </Link>
        </m.div>
      </section>

      {/* Footer */}
      <footer
        style={{
          padding: "24px 24px",
          borderTop: "1px solid #F0ECF8",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <Logo size="sm" />
        <span style={{ fontSize: 12, color: "#9CA3AF", fontFamily: "var(--font-inter), sans-serif" }}>© 2026 Nawa Studio</span>
        <Link href="/mentions-legales" style={{ fontSize: 12, color: "#9CA3AF", textDecoration: "none", fontFamily: "var(--font-inter), sans-serif" }}>
          Mentions légales
        </Link>
        <a href="mailto:contact@nawastudio.com" style={{ fontSize: 12, color: "#9CA3AF", textDecoration: "none", fontFamily: "var(--font-inter), sans-serif" }}>
          contact@nawastudio.com
        </a>
      </footer>
    </div>
  )
}
