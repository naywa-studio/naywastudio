"use client"

import Link from "next/link"
import { m } from "framer-motion"

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

/**
 * Transitional placeholder.
 *
 * The previous mission detail page powered the legacy sourcing flow
 * (Léo / Nora / Alex agents with VPS / Chrome extension / Google
 * scraping). That whole flow has been retired while the product
 * pivots to a CV intelligence CRM. This page stays as a soft landing
 * for any bookmarked mission URL.
 */
export default function MissionLegacyPage() {
  return (
    <div style={{
      minHeight: "calc(100vh - 60px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "60px 24px",
      background: "#FAFAFA",
    }}>
      <m.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE }}
        style={{
          background: "white", borderRadius: 18,
          border: "1px solid #F0ECF8",
          padding: "44px 40px",
          maxWidth: 520, width: "100%",
          textAlign: "center",
          boxShadow: "0 12px 40px rgba(124,99,200,0.08)",
          fontFamily: "var(--font-inter), sans-serif",
        }}
      >
        <div style={{
          width: 56, height: 56, borderRadius: 16,
          background: "linear-gradient(135deg, #7C63C8 0%, #6B54B2 100%)",
          margin: "0 auto 20px",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 6px 24px rgba(124,99,200,0.30)",
        }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M12 2.5l1.6 5.4 5.4 1.6-5.4 1.6L12 16.5l-1.6-5.4-5.4-1.6 5.4-1.6L12 2.5z"
              fill="white"
            />
            <circle cx="19" cy="5" r="1.4" fill="white" opacity="0.85" />
            <circle cx="5"  cy="18" r="1"   fill="white" opacity="0.7"  />
          </svg>
        </div>

        <h1 style={{
          margin: "0 0 12px",
          fontSize: 22, fontWeight: 800, color: "#111827",
          letterSpacing: "-0.02em",
        }}>
          Mission archivée
        </h1>
        <p style={{
          margin: "0 0 24px",
          fontSize: 14, color: "#4B5563", lineHeight: 1.65,
        }}>
          Naywa Studio évolue vers <strong>Nora — votre base de CV intelligente</strong>.
          L&apos;ancien sourcing automatisé est retiré pendant la transition.
          Les nouvelles fonctionnalités (upload CV, matching IA, anonymisation,
          suivi de pipeline) arrivent dans quelques jours.
        </p>

        <Link
          href="/workspace"
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "11px 22px", borderRadius: 10,
            background: "#7C63C8", color: "white",
            fontSize: 14, fontWeight: 700, textDecoration: "none",
            boxShadow: "0 4px 16px rgba(124,99,200,0.30)",
          }}
        >
          Retour au workspace →
        </Link>
      </m.div>
    </div>
  )
}
