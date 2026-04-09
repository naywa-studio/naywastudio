"use client"
import { m } from "framer-motion"
import { Logo } from "@/components/ui/Logo"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMockStore } from "@/lib/mock-store"

/* ─── Data ────────────────────────────────────────────────────── */

const LEVELS = [
  {
    number: 1,
    label: "Niveau 1",
    agentName: "Léo",
    agentRole: "Agent de tri & nettoyage",
    color: "#22c55e",
    colorLight: "rgba(34,197,94,0.08)",
    colorMid: "rgba(34,197,94,0.15)",
    borderColor: "rgba(34,197,94,0.25)",
    description:
      "Triez, nettoyez et filtrez une liste de candidats en quelques minutes. Uploadez un tableur, définissez votre profil cible, et Léo fait le reste.",
    features: [
      "Upload de tableur (export Walaxy, CSV…)",
      "Définition du profil cible en langage naturel",
      "Tableur nettoyé avec profils pertinents mis en évidence",
    ],
    result: "Un tableur propre et exploitable, prêt à l'usage.",
    positioning: "Solution simple et rapide pour débuter.",
    badge: null,
  },
  {
    number: 2,
    label: "Niveau 2",
    agentName: "Nora",
    agentRole: "Agent maître de sourcing",
    color: "#3b82f6",
    colorLight: "rgba(59,130,246,0.08)",
    colorMid: "rgba(59,130,246,0.15)",
    borderColor: "rgba(59,130,246,0.25)",
    description:
      "Nora prend en charge le sourcing de A à Z : analyse de votre besoin, tri des profils, scoring et priorisation. Vous échangez uniquement avec Nora.",
    features: [
      "Analyse fine du besoin de recrutement",
      "Tri automatique et nettoyage des listes",
      "Scoring & priorisation des candidats",
      "Shortlist prête à l'usage",
    ],
    result: "Une shortlist priorisée de candidats qualifiés.",
    positioning: "Automatisation métier réelle, sans complexité pour vous.",
    badge: "Recommandé",
  },
  {
    number: 3,
    label: "Niveau 3",
    agentName: "Alex",
    agentRole: "Agent orchestrateur de recrutement",
    color: "#7C63C8",
    colorLight: "rgba(124,99,200,0.08)",
    colorMid: "rgba(124,99,200,0.15)",
    borderColor: "rgba(124,99,200,0.25)",
    description:
      "Alex pilote l'intégralité de votre processus de sourcing : rédaction d'offres, chasse, scoring, contact candidats, booking d'entretiens, synthèse — le tout documenté étape par étape.",
    features: [
      "Analyse du besoin & rédaction d'offres",
      "Sourcing & chasse active de candidats",
      "Filtrage, scoring et priorisation",
      "Prise de contact & booking d'entretiens",
      "Transcription d'appels & synthèse candidat",
      "Reporting complet à chaque étape",
    ],
    result: "Dossiers candidats complets, prêts à être présentés au client final.",
    positioning: "L'équivalent d'une équipe de recrutement digitale.",
    badge: "Premium",
  },
] as const

/* ─── Animations ──────────────────────────────────────────────── */

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, delay: i * 0.12, ease: [0.25, 0.46, 0.45, 0.94] as const },
  }),
}

/* ─── Page ────────────────────────────────────────────────────── */

export default function CataloguePage() {
  const router = useRouter()
  const { subscribe } = useMockStore()

  const handleActivate = (level: number) => {
    subscribe(level)
    router.push("/espace-client/sourcing")
  }

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
            href="/espace-client"
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
            }}
          >
            Catalogue
          </span>
          <h1
            style={{
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
              fontSize: "clamp(16px, 2vw, 19px)",
              color: "#6B7280",
              lineHeight: 1.65,
              maxWidth: 640,
              margin: "0 auto",
            }}
          >
            Déléguez tout ou partie de votre processus de sourcing de candidats
            à des agents IA spécialisés, avec une montée en autonomie progressive.
          </p>
        </m.div>
      </section>

      {/* Visual flow: 3 levels */}
      <section style={{ padding: "20px 24px 80px", maxWidth: 1200, margin: "0 auto" }}>
        {/* Level progression indicator */}
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
                }}
              >
                {level.number}
              </div>
              {i < LEVELS.length - 1 && (
                <div
                  style={{
                    width: 80,
                    height: 2,
                    background: "linear-gradient(90deg, " + LEVELS[i].color + ", " + LEVELS[i + 1].color + ")",
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
                padding: "32px 28px 28px",
                display: "flex",
                flexDirection: "column",
                gap: 20,
                transition: "box-shadow 200ms, transform 200ms",
                cursor: "default",
              }}
              whileHover={{
                boxShadow: `0 12px 40px ${level.colorMid}`,
                y: -4,
              }}
            >
              {/* Badge */}
              {level.badge && (
                <div
                  style={{
                    position: "absolute",
                    top: -12,
                    right: 20,
                    background: level.color,
                    color: "white",
                    fontSize: 11,
                    fontWeight: 700,
                    padding: "4px 14px",
                    borderRadius: 100,
                    letterSpacing: 0.5,
                    textTransform: "uppercase",
                  }}
                >
                  {level.badge}
                </div>
              )}

              {/* Level header */}
              <div>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: 1.5,
                    textTransform: "uppercase",
                    color: level.color,
                  }}
                >
                  {level.label}
                </span>
                <h2
                  style={{
                    fontSize: 28,
                    fontWeight: 800,
                    color: "#111827",
                    margin: "8px 0 2px",
                    letterSpacing: -0.3,
                  }}
                >
                  {level.agentName}
                </h2>
                <p style={{ fontSize: 14, color: "#6B7280", margin: 0, fontWeight: 500 }}>
                  {level.agentRole}
                </p>
              </div>

              {/* Divider */}
              <div style={{ height: 1, background: level.borderColor }} />

              {/* Description */}
              <p style={{ fontSize: 14, color: "#4B5563", lineHeight: 1.65, margin: 0 }}>
                {level.description}
              </p>

              {/* Features */}
              <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
                {level.features.map((feat) => (
                  <div
                    key={feat}
                    style={{
                      display: "flex",
                      gap: 10,
                      alignItems: "flex-start",
                      fontSize: 13,
                      color: "#374151",
                      lineHeight: 1.5,
                    }}
                  >
                    <span
                      style={{
                        color: level.color,
                        fontSize: 15,
                        lineHeight: "20px",
                        flexShrink: 0,
                      }}
                    >
                      ✓
                    </span>
                    {feat}
                  </div>
                ))}
              </div>

              {/* Result */}
              <div
                style={{
                  background: level.colorLight,
                  borderRadius: 12,
                  padding: "14px 16px",
                  border: `1px solid ${level.borderColor}`,
                }}
              >
                <p style={{ fontSize: 12, fontWeight: 600, color: level.color, margin: "0 0 4px" }}>
                  Résultat
                </p>
                <p style={{ fontSize: 13, color: "#374151", margin: 0, lineHeight: 1.55 }}>
                  {level.result}
                </p>
              </div>

              {/* Positioning */}
              <p
                style={{
                  fontSize: 13,
                  color: "#9CA3AF",
                  fontStyle: "italic",
                  margin: 0,
                  textAlign: "center",
                }}
              >
                {level.positioning}
              </p>

              {/* CTA */}
              <button
                onClick={() => handleActivate(level.number)}
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
                  border: "none",
                  cursor: "pointer",
                  transition: "opacity 150ms, transform 150ms",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.9"; e.currentTarget.style.transform = "translateY(-1px)" }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.transform = "translateY(0)" }}
              >
                Activer {level.agentName} →
              </button>
            </m.div>
          ))}
        </div>
      </section>

      {/* How it works (simple) */}
      <section
        style={{
          padding: "64px 24px",
          background: "#F8F6FF",
          borderTop: "1px solid #F0ECF8",
          borderBottom: "1px solid #F0ECF8",
        }}
      >
        <div style={{ maxWidth: 800, margin: "0 auto", textAlign: "center" }}>
          <m.h2
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            style={{ fontSize: 28, fontWeight: 700, color: "#111827", marginBottom: 48 }}
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
              { step: "1", title: "Choisissez votre niveau", desc: "Sélectionnez le niveau d'autonomie adapté à vos besoins." },
              { step: "2", title: "Créez votre espace", desc: "Inscrivez-vous en 30 secondes et accédez à votre agent." },
              { step: "3", title: "Échangez avec votre agent", desc: "Décrivez votre besoin. Votre agent s'occupe du reste." },
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
                  }}
                >
                  {item.step}
                </div>
                <h3 style={{ fontSize: 16, fontWeight: 600, color: "#111827", marginBottom: 8 }}>
                  {item.title}
                </h3>
                <p style={{ fontSize: 14, color: "#6B7280", lineHeight: 1.6, margin: 0 }}>
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
          <h2 style={{ fontSize: 24, fontWeight: 700, color: "#111827", marginBottom: 12 }}>
            Prêt à automatiser votre sourcing ?
          </h2>
          <p style={{ fontSize: 15, color: "#6B7280", marginBottom: 28 }}>
            Créez votre espace client et commencez gratuitement.
          </p>
          <Link
            href="/espace-client"
            style={{
              display: "inline-block",
              background: "#7C63C8",
              color: "white",
              padding: "15px 32px",
              borderRadius: 12,
              fontSize: 15,
              fontWeight: 600,
              textDecoration: "none",
              boxShadow: "0 4px 16px rgba(124,99,200,0.3)",
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
        <span style={{ fontSize: 12, color: "#9CA3AF" }}>© 2026 Nawa Studio</span>
        <Link href="/mentions-legales" style={{ fontSize: 12, color: "#9CA3AF", textDecoration: "none" }}>
          Mentions légales
        </Link>
        <a href="mailto:contact@nawastudio.com" style={{ fontSize: 12, color: "#9CA3AF", textDecoration: "none" }}>
          contact@nawastudio.com
        </a>
      </footer>
    </div>
  )
}
