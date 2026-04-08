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

const guarantees = [
  { icon: "⚡", label: "Déployé en 48h" },
  { icon: "🔓", label: "Sans engagement" },
  { icon: "🎯", label: "Résultats en 7 jours" },
  { icon: "🛠️", label: "Support dédié inclus" },
]

export function FinalCTA({ onOpenOnboarding }: { onOpenOnboarding: () => void }) {
  return (
    <section
      style={{
        background: "#FFFFFF",
        padding: "112px 24px",
        borderTop: "1px solid #F0ECF8",
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
            Essai gratuit disponible
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
            Prêt à gagner du temps<br />
            avec vos agents IA ?
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
            Découvrez quel agent correspond à votre besoin en 2 minutes.
            Votre équipe d&apos;agents est opérationnelle sous 48h.
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
            <button
              onClick={onOpenOnboarding}
              style={{
                background: "#FFFFFF",
                color: "#7C63C8",
                borderRadius: 12,
                padding: "15px 32px",
                fontSize: 15,
                fontWeight: 700,
                border: "none",
                cursor: "pointer",
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
              Trouver mon agent →
            </button>

            <Link
              href="/catalogue"
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
              Voir le catalogue
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
