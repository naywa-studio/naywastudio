"use client"

import Link from "next/link"
import { m } from "framer-motion"
import { Logo } from "@/components/ui/Logo"

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

const fu = (delay: number) => ({
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.55, delay, ease: EASE },
})

const PACKAGES = [
  {
    id: "sourcing",
    icon: "🎯",
    name: "Package Sourcing",
    tagline: "Trouvez les bons profils, sans effort.",
    description:
      "Nora organise votre vivier de CVs, les match automatiquement avec vos postes ouverts, génère des versions anonymisées et suit votre pipeline candidat. Vous gardez la main sur le sourcing, l'IA gère le tri.",
    available: true,
    href: "/login?mode=signup",
    ctaLabel: "Essayer gratuitement →",
    color: "#7C63C8",
    colorLight: "rgba(124,99,200,0.06)",
    colorMid: "rgba(124,99,200,0.12)",
    borderColor: "rgba(124,99,200,0.25)",
    highlights: ["Upload de CVs (PDF / DOCX / photo)", "Matching IA automatique contre vos postes", "Anonymisation 1 clic + suivi pipeline"],
  },
  {
    id: "support",
    icon: "💬",
    name: "Package Support Client",
    tagline: "Un agent qui répond à votre place.",
    description:
      "Agent IA entraîné sur votre base de connaissance. Répond aux questions clients 24h/24, escalade les cas complexes, réduit votre charge de support.",
    available: false,
    href: null,
    ctaLabel: "Bientôt disponible",
    color: "#3B82F6",
    colorLight: "rgba(59,130,246,0.06)",
    colorMid: "rgba(59,130,246,0.10)",
    borderColor: "rgba(59,130,246,0.20)",
    highlights: ["Réponses automatiques 24/7", "Base de connaissance personnalisée", "Escalade intelligente"],
  },
  {
    id: "content",
    icon: "✍️",
    name: "Package Contenu",
    tagline: "Publiez sans y penser.",
    description:
      "Génération automatique de posts LinkedIn, newsletters et fiches de poste à partir de vos briefs. Votre voix, amplifiée.",
    available: false,
    href: null,
    ctaLabel: "Bientôt disponible",
    color: "#F59E0B",
    colorLight: "rgba(245,158,11,0.06)",
    colorMid: "rgba(245,158,11,0.10)",
    borderColor: "rgba(245,158,11,0.20)",
    highlights: ["Posts LinkedIn & newsletters", "Fiches de poste rédigées", "Ton adapté à votre marque"],
  },
] as const

export default function PackagesPage() {
  return (
    <div style={{ background: "#FAFAFA", minHeight: "100vh" }}>
      {/* Header */}
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
        <Link
          href="/workspace"
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: "#7C63C8",
            textDecoration: "none",
            padding: "7px 14px",
            borderRadius: 8,
            border: "1.5px solid #E2DAF6",
            fontFamily: "var(--font-inter), sans-serif",
          }}
        >
          ← Mon espace
        </Link>
      </header>

      {/* Hero */}
      <section style={{ padding: "72px 24px 48px", textAlign: "center", maxWidth: 640, margin: "0 auto" }}>
        <m.div {...fu(0)}>
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
            Choisir un package
          </span>
          <h1
            style={{
              fontFamily: "var(--font-space-grotesk), sans-serif",
              fontSize: "clamp(28px, 5vw, 44px)",
              fontWeight: 800,
              color: "#111827",
              margin: "0 0 16px",
              letterSpacing: -0.5,
              lineHeight: 1.15,
            }}
          >
            Quel agent pour votre métier ?
          </h1>
          <p
            style={{
              fontFamily: "var(--font-inter), sans-serif",
              fontSize: 17,
              color: "#6B7280",
              lineHeight: 1.65,
              margin: 0,
            }}
          >
            Chaque package est un agent dédié, déployé sur votre VPS en 48h.
            Choisissez le domaine qui correspond à votre priorité.
          </p>
        </m.div>
      </section>

      {/* Cards */}
      <section style={{ maxWidth: 1100, margin: "0 auto", padding: "0 24px 80px" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
            gap: 24,
          }}
        >
          {PACKAGES.map((pkg, i) => (
            <m.div
              key={pkg.id}
              {...fu(0.1 + i * 0.08)}
              style={{
                background: "white",
                borderRadius: 20,
                border: `1.5px solid ${pkg.borderColor}`,
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
                position: "relative",
                opacity: pkg.available ? 1 : 0.72,
              }}
            >
              {/* Top accent */}
              <div style={{ height: 3, background: `linear-gradient(90deg, ${pkg.color}, transparent)` }} />

              {/* Coming soon ribbon */}
              {!pkg.available && (
                <div
                  style={{
                    position: "absolute",
                    top: 20,
                    right: 20,
                    background: "#F3F4F6",
                    border: "1px solid #E5E7EB",
                    color: "#6B7280",
                    fontSize: 10,
                    fontWeight: 700,
                    padding: "4px 10px",
                    borderRadius: 100,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    fontFamily: "var(--font-inter), sans-serif",
                  }}
                >
                  Bientôt
                </div>
              )}

              <div style={{ padding: "28px 28px 32px", display: "flex", flexDirection: "column", gap: 20, flex: 1 }}>
                {/* Icon + name */}
                <div>
                  <div
                    style={{
                      width: 52,
                      height: 52,
                      borderRadius: 14,
                      background: pkg.colorLight,
                      border: `1px solid ${pkg.borderColor}`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 24,
                      marginBottom: 16,
                    }}
                  >
                    {pkg.icon}
                  </div>
                  <h2
                    style={{
                      fontFamily: "var(--font-space-grotesk), sans-serif",
                      fontSize: 22,
                      fontWeight: 800,
                      color: "#111827",
                      margin: "0 0 4px",
                      letterSpacing: -0.2,
                    }}
                  >
                    {pkg.name}
                  </h2>
                  <p
                    style={{
                      fontFamily: "var(--font-inter), sans-serif",
                      fontSize: 14,
                      fontWeight: 600,
                      color: pkg.color,
                      margin: 0,
                    }}
                  >
                    {pkg.tagline}
                  </p>
                </div>

                {/* Divider */}
                <div style={{ height: 1, background: pkg.borderColor }} />

                {/* Description */}
                <p
                  style={{
                    fontFamily: "var(--font-inter), sans-serif",
                    fontSize: 14,
                    color: "#4B5563",
                    lineHeight: 1.7,
                    margin: 0,
                    flex: 1,
                  }}
                >
                  {pkg.description}
                </p>

                {/* Highlights */}
                <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
                  {pkg.highlights.map((h) => (
                    <li
                      key={h}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
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
                          background: pkg.colorLight,
                          border: `1px solid ${pkg.borderColor}`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                          <path d="M1.5 4L3.5 6L6.5 2" stroke={pkg.color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </span>
                      {h}
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                {pkg.available ? (
                  <Link
                    href={pkg.href!}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "center",
                      padding: "14px 24px",
                      borderRadius: 12,
                      fontWeight: 700,
                      fontSize: 15,
                      color: "white",
                      background: pkg.color,
                      textDecoration: "none",
                      fontFamily: "var(--font-inter), sans-serif",
                      boxShadow: `0 4px 16px ${pkg.colorMid}`,
                      boxSizing: "border-box",
                      transition: "opacity 150ms, transform 150ms",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.opacity = "0.9"
                      e.currentTarget.style.transform = "translateY(-1px)"
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.opacity = "1"
                      e.currentTarget.style.transform = "translateY(0)"
                    }}
                  >
                    {pkg.ctaLabel}
                  </Link>
                ) : (
                  <div
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "center",
                      padding: "14px 24px",
                      borderRadius: 12,
                      fontWeight: 700,
                      fontSize: 15,
                      color: "#9CA3AF",
                      background: "#F9FAFB",
                      border: "1.5px solid #E5E7EB",
                      fontFamily: "var(--font-inter), sans-serif",
                      boxSizing: "border-box",
                      cursor: "default",
                    }}
                  >
                    {pkg.ctaLabel}
                  </div>
                )}
              </div>
            </m.div>
          ))}
        </div>
      </section>
    </div>
  )
}
