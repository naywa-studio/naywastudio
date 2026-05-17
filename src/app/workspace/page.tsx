"use client"

import { useEffect, useRef } from "react"
import Link from "next/link"
import { m } from "framer-motion"
import { useWorkspace } from "./layout"
import BrandingCard from "@/components/workspace/BrandingCard"

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

/**
 * Workspace home — kept intentionally minimal for now.
 *
 * The "Aujourd'hui" dashboard (today's interviews, recent replies,
 * follow-ups) was hidden alongside the rest of the mail / calendar
 * surface — those features ship later. What's left is a welcome
 * banner, branding setup, and quick links into the actual workflow.
 */

export default function WorkspaceHome() {
  const { profile, hasSubscription, refetchProfile } = useWorkspace()
  const granted = useRef(false)

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
      maxWidth: 960, margin: "0 auto",
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
          marginBottom: 14,
        }}>
          Accueil
        </span>
        <h1 style={{
          margin: 0, fontSize: "clamp(28px, 3.8vw, 38px)", fontWeight: 800,
          color: "#111827", letterSpacing: "-0.025em", lineHeight: 1.1,
        }}>
          Bonjour{firstName ? `, ${firstName}` : ""} 👋
        </h1>
        <p style={{ margin: "10px 0 32px", fontSize: 14.5, color: "#6B7280", lineHeight: 1.65, maxWidth: "58ch" }}>
          Bienvenue dans votre espace Nora. Démarrez par alimenter votre vivier,
          créez vos postes et laissez Nora vous proposer les meilleurs candidats.
        </p>
      </m.div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14, marginBottom: 28 }}>
        <QuickNav href="/workspace/vivier"   label="Vivier"   desc="Vos CVs et candidats" />
        <QuickNav href="/workspace/postes"   label="Postes"   desc="Vos rôles à pourvoir" />
        <QuickNav href="/workspace/pipeline" label="Pipeline" desc="Suivi candidat × poste" />
      </div>

      <BrandingCard />
    </main>
  )
}

function QuickNav({ href, label, desc }: { href: string; label: string; desc: string }) {
  return (
    <Link href={href} style={{
      display: "block", padding: "18px 20px",
      background: "white", border: "1px solid #F0ECF8", borderRadius: 14,
      textDecoration: "none",
      transition: "border-color 160ms, transform 160ms",
    }}>
      <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: "#111827", letterSpacing: "-0.01em" }}>
        {label} <span style={{ color: "#7C63C8", fontWeight: 700 }}>→</span>
      </p>
      <p style={{ margin: "4px 0 0", fontSize: 12.5, color: "#6B7280" }}>
        {desc}
      </p>
    </Link>
  )
}
