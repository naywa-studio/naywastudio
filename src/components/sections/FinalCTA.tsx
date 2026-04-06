"use client"
import { m } from "framer-motion"

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
          Trouvez votre agent en 2 minutes.
        </h2>
        <p style={{ margin: 0, fontSize: 14, color: "#4B5563" }}>
          Premier appel offert · Sans engagement · Réponse sous 24h
        </p>
        <button
          onClick={onOpenOnboarding}
          style={{
            marginTop: 8,
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
            e.currentTarget.style.boxShadow = "0 4px 20px rgba(61,139,94,0.25)"
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "#7C63C8"
            e.currentTarget.style.boxShadow = "none"
          }}
        >
          Testez maintenant →
        </button>
      </m.div>
    </section>
  )
}
