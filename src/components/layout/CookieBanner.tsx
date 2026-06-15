"use client"

import { useEffect, useState } from "react"
import Link from "next/link"

/**
 * Bannière cookies minimale conforme RGPD pour un site B2B SaaS.
 *
 * Périmètre Naywa V1 — cookies STRICTEMENT TECHNIQUES :
 *   - auth Supabase (session sb-*)         → nécessaire au login
 *   - cookies Stripe (checkout)            → nécessaires au paiement
 *   - localStorage applicatif (tabs, etc.) → fonctionnel UI
 *
 * Pas de tracking analytics (ni GA, ni Hotjar, ni Meta Pixel), pas de
 * pub. Du coup la bannière n'a pas à proposer un vrai « Refuser » à
 * gros bouton — on informe et on stocke l'acquittement utilisateur dans
 * localStorage pour ne plus l'afficher.
 *
 * Le jour où on ajoute du tracking non-essentiel (GA4, Posthog, etc.),
 * il faudra basculer sur un vrai CMP avec 2 boutons (Accepter tout /
 * Refuser) et une catégorisation par finalité (cf. CNIL).
 */

const STORAGE_KEY = "naywa.cookies.ack.v1"

export function CookieBanner() {
  const [visible, setVisible] = useState(false)

  // Lecture localStorage uniquement côté client pour éviter le flash
  // entre SSR (hidden) et l'hydratation client.
  useEffect(() => {
    try {
      const acked = window.localStorage.getItem(STORAGE_KEY)
      if (acked !== "1") setVisible(true)
    } catch {
      // Storage bloqué (mode privé strict) → ne pas afficher pour éviter
      // une bannière qui ne pourra jamais disparaître.
      setVisible(false)
    }
  }, [])

  const ack = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, "1")
    } catch {
      /* ignore */
    }
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div
      role="dialog"
      aria-label="Information cookies"
      style={{
        position: "fixed",
        bottom: 16,
        left: 16,
        right: 16,
        maxWidth: 520,
        margin: "0 auto",
        zIndex: 90,
        background: "rgba(17,24,39,0.94)",
        backdropFilter: "blur(8px)",
        color: "#FFFFFF",
        borderRadius: 14,
        padding: "14px 18px",
        boxShadow: "0 18px 48px -16px rgba(17,24,39,0.40)",
        display: "flex",
        gap: 14,
        alignItems: "center",
        flexWrap: "wrap",
        fontFamily: "var(--font-inter), sans-serif",
        fontSize: 13,
        lineHeight: 1.55,
      }}
    >
      <span style={{ flex: 1, minWidth: 220 }}>
        Naywa utilise uniquement des cookies <strong>techniques</strong>
        {" "}(authentification, paiement). Aucun pistage publicitaire.{" "}
        <Link
          href="/politique-confidentialite"
          style={{
            color: "#B8AEDE",
            textDecoration: "underline",
            textUnderlineOffset: 2,
          }}
        >
          En savoir plus
        </Link>
        .
      </span>
      <button
        type="button"
        onClick={ack}
        style={{
          background: "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)",
          color: "#FFFFFF",
          border: "none",
          borderRadius: 10,
          padding: "9px 18px",
          fontSize: 12.5,
          fontWeight: 700,
          cursor: "pointer",
          fontFamily: "inherit",
          letterSpacing: "0.01em",
          flexShrink: 0,
        }}
      >
        J&rsquo;ai compris
      </button>
    </div>
  )
}
