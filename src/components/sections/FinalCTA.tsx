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

// Pas d'emoji UI (design system) — check sobre uniforme. Les promesses
// doivent refléter le produit LIVE : essai 15 j + matchings illimités.
const guarantees = [
  { icon: "✓", label: "Setup en 2 min" },
  { icon: "✓", label: "15 jours d'essai gratuits" },
  { icon: "✓", label: "Matchings illimités" },
  { icon: "✓", label: "Sans carte bancaire" },
]

export function FinalCTA() {
  return (
    <section
      style={{
        background: "transparent",
        padding: "112px 24px",
        borderTop: "1px solid rgba(240,236,248,0.6)",
        position: "relative",
      }}
    >
      <div style={{ maxWidth: 960, margin: "0 auto" }}>

        {/* Main card */}
        <m.div
          {...fu(0)}
          style={{
            background: "linear-gradient(135deg, #7C63C8 0%, #6952B8 40%, #5A42A8 100%)",
            borderRadius: 24,
            padding: "72px 56px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
            gap: 0,
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* Decorative dot grid overlay */}
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.08) 1px, transparent 1px)",
              backgroundSize: "24px 24px",
              maskImage: "radial-gradient(ellipse 80% 70% at 50% 50%, black 30%, transparent 100%)",
              WebkitMaskImage: "radial-gradient(ellipse 80% 70% at 50% 50%, black 30%, transparent 100%)",
              pointerEvents: "none",
            }}
          />

          {/* Top glow */}
          <div
            aria-hidden
            style={{
              position: "absolute",
              top: -80,
              left: "50%",
              transform: "translateX(-50%)",
              width: 480,
              height: 280,
              background: "radial-gradient(ellipse at center, rgba(255,255,255,0.15) 0%, transparent 65%)",
              pointerEvents: "none",
            }}
          />

          {/* Badge */}
          <m.span
            {...fu(0.08)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              background: "rgba(255,255,255,0.15)",
              border: "1px solid rgba(255,255,255,0.25)",
              borderRadius: 100,
              padding: "5px 14px",
              fontSize: 11,
              fontWeight: 600,
              color: "rgba(255,255,255,0.9)",
              letterSpacing: "0.09em",
              textTransform: "uppercase" as const,
              fontFamily: "var(--font-inter), sans-serif",
              marginBottom: 28,
              position: "relative",
            }}
          >
            <span
              style={{
                width: 5,
                height: 5,
                borderRadius: "50%",
                background: "#C8BCEC",
                boxShadow: "0 0 8px rgba(200,188,236,0.9)",
                flexShrink: 0,
              }}
            />
            15 jours gratuits · Sans engagement
          </m.span>

          {/* Headline */}
          <m.h2
            {...fu(0.14)}
            style={{
              fontFamily: "var(--font-space-grotesk), sans-serif",
              fontSize: "clamp(28px, 4vw, 48px)",
              fontWeight: 800,
              color: "#FFFFFF",
              letterSpacing: "-0.03em",
              lineHeight: 1.1,
              margin: "0 0 20px",
              maxWidth: "22ch",
              position: "relative",
            }}
          >
            Prêt à sourcer<br />
            vos premiers candidats ?
          </m.h2>

          {/* Subtext */}
          <m.p
            {...fu(0.2)}
            style={{
              fontFamily: "var(--font-inter), sans-serif",
              fontSize: 15,
              color: "rgba(255,255,255,0.72)",
              lineHeight: 1.7,
              margin: "0 0 44px",
              maxWidth: "44ch",
              position: "relative",
            }}
          >
            Créez votre compte et lancez votre première recherche en 2 minutes.
            Nora traite, vous décidez.
          </m.p>

          {/* CTA buttons */}
          <m.div
            {...fu(0.26)}
            style={{
              display: "flex",
              gap: 12,
              flexWrap: "wrap" as const,
              justifyContent: "center",
              alignItems: "center",
              position: "relative",
              marginBottom: 48,
            }}
          >
            <Link
              href="/login?mode=signup"
              style={{
                background: "#FFFFFF",
                color: "#7C63C8",
                borderRadius: 12,
                padding: "15px 32px",
                fontSize: 15,
                fontWeight: 700,
                textDecoration: "none",
                transition: "all 200ms cubic-bezier(0.22, 1, 0.36, 1)",
                fontFamily: "var(--font-inter), sans-serif",
                letterSpacing: "-0.01em",
                boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-2px)"
                e.currentTarget.style.boxShadow = "0 8px 32px rgba(0,0,0,0.2)"
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)"
                e.currentTarget.style.boxShadow = "0 4px 20px rgba(0,0,0,0.15)"
              }}
            >
              Commencer gratuitement →
            </Link>

            <Link
              href="/tarifs"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                color: "rgba(255,255,255,0.85)",
                fontSize: 14,
                fontWeight: 500,
                textDecoration: "none",
                padding: "15px 20px",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.2)",
                background: "rgba(255,255,255,0.08)",
                fontFamily: "var(--font-inter), sans-serif",
                transition: "all 150ms",
                backdropFilter: "blur(4px)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(255,255,255,0.15)"
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.35)"
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "rgba(255,255,255,0.08)"
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.2)"
              }}
            >
              Voir les tarifs
            </Link>
          </m.div>

          {/* Guarantees row */}
          <m.div
            {...fu(0.32)}
            style={{
              display: "flex",
              gap: 24,
              flexWrap: "wrap" as const,
              justifyContent: "center",
              alignItems: "center",
              position: "relative",
              borderTop: "1px solid rgba(255,255,255,0.15)",
              paddingTop: 28,
              width: "100%",
            }}
          >
            {guarantees.map(({ icon, label }) => (
              <div
                key={label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                  fontFamily: "var(--font-inter), sans-serif",
                  fontSize: 13,
                  fontWeight: 500,
                  color: "rgba(255,255,255,0.75)",
                }}
              >
                <span style={{ fontSize: 14 }}>{icon}</span>
                {label}
              </div>
            ))}
          </m.div>

        </m.div>
      </div>
    </section>
  )
}
