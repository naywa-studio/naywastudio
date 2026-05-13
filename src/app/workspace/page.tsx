"use client"

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { m } from "framer-motion"
import { useWorkspace } from "./layout"

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

const FEATURES = [
  { done: true,  title: "Vivier de CVs",            desc: "Upload PDF, parsing IA, recherche full-text, dédup." },
  { done: false, title: "Postes & matching",        desc: "Bientôt — décrivez vos postes, Nora score chaque CV." },
  { done: false, title: "CVs anonymisés",           desc: "Bientôt — export PDF sans nom, photo ni contacts." },
  { done: false, title: "Pipeline candidat",        desc: "Bientôt — Identifié → Contacté → Réponse → Entretien." },
  { done: false, title: "Intégration boîte mail",   desc: "Bientôt — BCC tracking puis Gmail / Outlook OAuth." },
] as const

export default function WorkspaceHome() {
  const router = useRouter()
  const { profile, hasSubscription, refetchProfile } = useWorkspace()
  const granted = useRef(false)

  // Auto-grant nora tier on first visit
  useEffect(() => {
    if (granted.current || hasSubscription) return
    granted.current = true
    ;(async () => {
      try {
        const r = await fetch("/api/subscribe", { method: "POST" })
        if (r.ok || r.status === 409) await refetchProfile()
      } catch { /* ignore */ }
    })()
  }, [hasSubscription, refetchProfile])

  const firstName = profile?.first_name?.trim() || null

  return (
    <main style={{
      maxWidth: 920, margin: "0 auto",
      padding: "44px 24px 80px",
      fontFamily: "var(--font-inter), sans-serif",
    }}>
      <m.div
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: EASE }}
      >
        <span style={{
          display: "inline-block",
          fontSize: 11, fontWeight: 700, color: "#7C63C8",
          background: "rgba(124,99,200,0.08)", border: "1px solid rgba(124,99,200,0.18)",
          padding: "4px 11px", borderRadius: 100,
          letterSpacing: "0.08em", textTransform: "uppercase",
          marginBottom: 16,
        }}>
          Accueil
        </span>
        <h1 style={{
          margin: 0, fontSize: "clamp(28px, 4vw, 38px)", fontWeight: 800,
          color: "#111827", letterSpacing: "-0.025em", lineHeight: 1.1,
        }}>
          Bonjour{firstName ? `, ${firstName}` : ""} 👋
        </h1>
        <p style={{ margin: "10px 0 28px", fontSize: 15, color: "#4B5563", lineHeight: 1.7, maxWidth: "58ch" }}>
          Voici votre espace Nora. Pour démarrer, alimentez votre vivier avec vos premiers CVs.
          Le matching avec vos postes et l&apos;anonymisation arrivent dans les prochains sprints.
        </p>
      </m.div>

      {/* CTA: vivier */}
      <m.div
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, delay: 0.08, ease: EASE }}
        style={{
          background: "linear-gradient(135deg, #7C63C8 0%, #6952B8 100%)",
          borderRadius: 20,
          padding: "28px 30px",
          color: "white",
          marginBottom: 32,
          display: "grid",
          gridTemplateColumns: "1fr auto",
          gap: 18,
          alignItems: "center",
          boxShadow: "0 14px 40px -14px rgba(124,99,200,0.55)",
        }}
        className="ws-cta"
      >
        <div>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.85 }}>
            Étape 1
          </p>
          <h2 style={{ margin: "6px 0 6px", fontSize: 22, fontWeight: 800, letterSpacing: "-0.015em" }}>
            Construisez votre vivier
          </h2>
          <p style={{ margin: 0, fontSize: 13.5, opacity: 0.85, lineHeight: 1.6, maxWidth: "52ch" }}>
            Glissez vos CVs PDF — Nora parse, déduplique et indexe. Tout reste privé sur votre espace.
          </p>
        </div>
        <button
          onClick={() => router.push("/workspace/vivier")}
          style={{
            background: "white", color: "#7C63C8",
            padding: "12px 22px", borderRadius: 12,
            fontSize: 14, fontWeight: 700, border: "none",
            cursor: "pointer", fontFamily: "inherit",
            boxShadow: "0 6px 18px rgba(0,0,0,0.15)",
          }}
        >
          Ouvrir le vivier →
        </button>
      </m.div>

      {/* Roadmap */}
      <m.div
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, delay: 0.16, ease: EASE }}
        style={{
          background: "white", border: "1px solid #F0ECF8", borderRadius: 18,
          padding: "24px 26px",
        }}
      >
        <p style={{
          margin: "0 0 14px", fontSize: 11, fontWeight: 700, color: "#9CA3AF",
          letterSpacing: "0.08em", textTransform: "uppercase",
        }}>
          Roadmap Nora
        </p>
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 12 }}>
          {FEATURES.map((f) => (
            <li key={f.title} style={{
              display: "flex", alignItems: "flex-start", gap: 12,
              fontSize: 14, color: "#374151", lineHeight: 1.6,
            }}>
              <span style={{
                flexShrink: 0, marginTop: 2,
                width: 22, height: 22, borderRadius: 7,
                background: f.done ? "rgba(34,197,94,0.10)" : "rgba(124,99,200,0.08)",
                color: f.done ? "#16a34a" : "#7C63C8",
                fontSize: 12, fontWeight: 800,
                display: "inline-flex", alignItems: "center", justifyContent: "center",
              }}>
                {f.done ? "✓" : "•"}
              </span>
              <span>
                <strong style={{ color: "#111827" }}>{f.title}</strong>
                {" — "}
                <span style={{ color: "#6B7280" }}>{f.desc}</span>
              </span>
            </li>
          ))}
        </ul>
        <div style={{
          marginTop: 22, paddingTop: 18, borderTop: "1px solid #F0ECF8",
          display: "flex", gap: 14, flexWrap: "wrap",
          fontSize: 13,
        }}>
          <Link href="/comment-ca-marche" style={{ color: "#7C63C8", fontWeight: 600, textDecoration: "none" }}>
            Voir le détail produit →
          </Link>
          <Link href="/tarifs" style={{ color: "#7C63C8", fontWeight: 600, textDecoration: "none" }}>
            Voir les tarifs →
          </Link>
          <span style={{ marginLeft: "auto", color: "#9CA3AF" }}>
            Feedback : <a href="mailto:contact@nawastudio.com" style={{ color: "#7C63C8", textDecoration: "none" }}>contact@nawastudio.com</a>
          </span>
        </div>
      </m.div>

      <style>{`
        @media (max-width: 640px) {
          .ws-cta { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </main>
  )
}
