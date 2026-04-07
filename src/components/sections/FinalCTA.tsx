"use client"
import { m } from "framer-motion"
import Link from "next/link"

export function FinalCTA({ onOpenOnboarding }: { onOpenOnboarding: () => void }) {
  return (
    <section style={{ background: "#EEE9FB", padding: "100px 24px" }}>
      <m.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
        style={{
          maxWidth: 600,
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          gap: 16,
        }}
      >
        <h2
          style={{
            fontFamily: "var(--font-space-grotesk), sans-serif",
            fontWeight: 700,
            fontSize: "clamp(28px, 4vw, 38px)",
            color: "#111827",
            lineHeight: 1.15,
            margin: 0,
          }}
        >
          Prêt à automatiser votre sourcing ?
        </h2>
        <p style={{ margin: 0, fontSize: 14, color: "#4B5563" }}>
          Essai gratuit · Sans engagement · Résultat en 24h
        </p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center", marginTop: 8 }}>
          <button
            onClick={onOpenOnboarding}
            style={{
              background: "#7C63C8",
              color: "#FFFFFF",
              borderRadius: 12,
              padding: "16px 32px",
              fontSize: 16,
              fontWeight: 600,
              border: "none",
              cursor: "pointer",
              transition: "background 150ms, box-shadow 150ms",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "#6B54B2"
              e.currentTarget.style.boxShadow = "0 4px 20px rgba(124,99,200,0.3)"
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "#7C63C8"
              e.currentTarget.style.boxShadow = "none"
            }}
          >
            Trouver mon agent →
          </button>
          <Link
            href="/catalogue"
            style={{
              display: "inline-flex",
              alignItems: "center",
              color: "#7C63C8",
              fontSize: 15,
              fontWeight: 500,
              textDecoration: "none",
              padding: "16px 24px",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
            onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
          >
            Voir le catalogue
          </Link>
        </div>
      </m.div>
    </section>
  )
}
