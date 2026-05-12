"use client"

import { useEffect, useRef } from "react"
import Link from "next/link"
import { m } from "framer-motion"
import { useWorkspace } from "./layout"

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

/**
 * Transitional workspace.
 *
 * The legacy sourcing flow (Léo / Nora / Alex agents, Chrome extension,
 * Google scraping, VPS provisioning) has been retired. The product is
 * pivoting to a CV intelligence CRM built around Nora.
 *
 * This page :
 *  - silently grants the user the new "nora" subscription on first
 *    visit so the layout context doesn't break ;
 *  - shows the roadmap and a clear "coming soon" message ;
 *  - replaces the previous mission list + chat workspace.
 */
export default function WorkspacePage() {
  const { profile, hasSubscription, refetchProfile } = useWorkspace()
  const granted = useRef(false)

  // Auto-grant the user the "nora" tier on first visit so the layout
  // context stops trying to redirect them through /packages.
  useEffect(() => {
    if (granted.current) return
    if (hasSubscription) return
    granted.current = true
    ;(async () => {
      try {
        const res = await fetch("/api/subscribe", { method: "POST" })
        if (res.ok || res.status === 409) await refetchProfile()
      } catch { /* ignore */ }
    })()
  }, [hasSubscription, refetchProfile])

  const firstName = profile?.first_name?.trim() || null

  return (
    <main style={{
      minHeight: "calc(100vh - 60px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "60px 24px",
      background: "#FAFAFA",
    }}>
      <m.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: EASE }}
        style={{
          maxWidth: 720, width: "100%",
          background: "white", borderRadius: 20,
          border: "1px solid #F0ECF8",
          padding: "48px 44px",
          boxShadow: "0 14px 44px rgba(124,99,200,0.08)",
          fontFamily: "var(--font-inter), sans-serif",
        }}
      >
        {/* Beta pill */}
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 7,
          background: "rgba(124,99,200,0.08)", border: "1px solid rgba(124,99,200,0.18)",
          borderRadius: 999, padding: "5px 13px",
          marginBottom: 18,
          fontSize: 11, fontWeight: 700, color: "#7C63C8",
          letterSpacing: "0.07em", textTransform: "uppercase",
        }}>
          Beta privée · transition v2
        </span>

        <h1 style={{
          margin: "0 0 14px",
          fontSize: "clamp(26px, 3.8vw, 38px)",
          fontWeight: 800, color: "#111827",
          letterSpacing: "-0.025em", lineHeight: 1.1,
        }}>
          Bienvenue{firstName ? `, ${firstName}` : ""} 👋
        </h1>

        <p style={{
          margin: "0 0 30px",
          fontSize: 15, color: "#4B5563", lineHeight: 1.7,
        }}>
          Naywa Studio évolue. La nouvelle version, <strong>Nora</strong>, est en construction
          — un cockpit IA pour les sourceurs : upload de CVs, matching automatique avec vos
          postes ouverts, anonymisation et suivi du pipeline candidat. Premières fonctionnalités
          sous quelques jours.
        </p>

        {/* Roadmap */}
        <div style={{ marginBottom: 28 }}>
          <p style={{
            margin: "0 0 12px",
            fontSize: 11, fontWeight: 700, color: "#9CA3AF",
            textTransform: "uppercase", letterSpacing: "0.07em",
          }}>
            Ce qui arrive
          </p>
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
            {ROADMAP.map((r) => (
              <li key={r.title} style={{
                display: "flex", alignItems: "flex-start", gap: 12,
                fontSize: 14, color: "#374151", lineHeight: 1.6,
              }}>
                <span style={{
                  flexShrink: 0, marginTop: 1,
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  width: 22, height: 22, borderRadius: 7,
                  background: r.done ? "rgba(34,197,94,0.10)" : "rgba(124,99,200,0.10)",
                  color: r.done ? "#16a34a" : "#7C63C8",
                  fontSize: 12, fontWeight: 800,
                }}>
                  {r.done ? "✓" : "•"}
                </span>
                <span>
                  <strong style={{ color: "#111827" }}>{r.title}</strong>
                  {" — "}
                  <span style={{ color: "#6B7280" }}>{r.desc}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* CTA secondary */}
        <div style={{
          paddingTop: 20,
          borderTop: "1px solid #F0ECF8",
          display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center",
        }}>
          <Link href="/comment-ca-marche" style={{
            fontSize: 13, fontWeight: 600, color: "#7C63C8",
            textDecoration: "none",
          }}>
            Voir le détail du produit →
          </Link>
          <Link href="/tarifs" style={{
            fontSize: 13, fontWeight: 600, color: "#7C63C8",
            textDecoration: "none",
          }}>
            Voir la tarification →
          </Link>
          <span style={{ marginLeft: "auto", fontSize: 12, color: "#9CA3AF" }}>
            Une question ? <a href="mailto:contact@nawastudio.com" style={{ color: "#7C63C8", textDecoration: "none" }}>contact@nawastudio.com</a>
          </span>
        </div>
      </m.div>
    </main>
  )
}

const ROADMAP = [
  { done: true,  title: "Comptes ouverts",           desc: "inscription email ou Google, gratuit pendant la beta" },
  { done: false, title: "Upload de CVs",             desc: "drop PDF / DOCX / images, parsing IA structuré" },
  { done: false, title: "Postes ouverts & matching", desc: "Nora score chaque CV contre vos postes et justifie" },
  { done: false, title: "CV anonymisé",              desc: "génération PDF anonymisé prêt à transmettre aux clients" },
  { done: false, title: "Pipeline & suivi",          desc: "Identifié → Contacté → Réponse → Entretien → Offre" },
  { done: false, title: "Intégration boîte mail",    desc: "BCC tracking puis Gmail / Outlook OAuth pour auto-log" },
] as const
