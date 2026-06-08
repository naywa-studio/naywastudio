"use client"

import { useState } from "react"
import Link from "next/link"
import type { Organization } from "@/lib/database.types"
import { trialStatus } from "@/lib/trial"

/**
 * Sticky banner displayed on top of /cabinet and /workspace layouts
 * whenever the trial is active or expired. Pending state shows
 * nothing (the activation modal handles that case).
 *
 * Three visual modes :
 *   - default (≥ 4 days left) -> soft violet, informational
 *   - warning (1-3 days left) -> warmer amber
 *   - expired                 -> red but non-blocking
 *
 * Dismissable per-session only via localStorage flag — we want the
 * owner to see it again the next morning if expiry is close.
 */

interface Props {
  organization: Organization | null | undefined
  /** Hide the dismiss button. Default false. */
  alwaysVisible?: boolean
}

const STORAGE_KEY = "naywa.trialBanner.dismissed.session"

/** Lit sessionStorage sans crasher en SSR. Utilisé comme initialiseur de
 *  useState pour éviter le pattern setState-dans-useEffect que le nouveau
 *  plugin React hooks signale en erreur. */
function readDismissed(): boolean {
  if (typeof window === "undefined") return false
  try {
    return sessionStorage.getItem(STORAGE_KEY) === "1"
  } catch {
    return false
  }
}

export function TrialBanner({ organization, alwaysVisible = false }: Props) {
  // État local pour pouvoir re-render quand l'utilisateur clique sur la
  // croix. La valeur initiale lit sessionStorage côté client uniquement
  // (en SSR on retourne false ; il y aura un éventuel flash 1 frame puis
  // le re-render client cache la bannière si elle était déjà fermée).
  const [dismissed, setDismissed] = useState(readDismissed)

  if (!organization) return null
  const status = trialStatus(organization)
  if (status.state === "pending") return null

  // Le dismiss n'est honoré que pour les bannières "informatives"
  // (essai actif + au moins 4 j restants). En warning ou expiré, on
  // ré-affiche systématiquement, le sourceur ne peut pas l'enterrer.
  const dismissAllowed =
    !alwaysVisible && status.state === "active" && status.daysLeft >= 4
  if (dismissed && dismissAllowed) return null

  const isExpired = status.state === "expired"
  const isWarning = !isExpired && status.daysLeft <= 3

  const palette = isExpired
    ? {
        bg:     "linear-gradient(90deg, rgba(254,226,226,0.95) 0%, rgba(254,202,202,0.95) 100%)",
        border: "1px solid rgba(239,68,68,0.32)",
        color:  "#991B1B",
        accent: "#DC2626",
      }
    : isWarning
    ? {
        bg:     "linear-gradient(90deg, rgba(254,243,199,0.95) 0%, rgba(253,230,138,0.95) 100%)",
        border: "1px solid rgba(217,119,6,0.30)",
        color:  "#92400E",
        accent: "#D97706",
      }
    : {
        bg:     "linear-gradient(90deg, rgba(243,232,255,0.95) 0%, rgba(233,213,255,0.95) 100%)",
        border: "1px solid rgba(124,99,200,0.25)",
        color:  "#5B45A8",
        accent: "#7C63C8",
      }

  const dismiss = () => {
    try { sessionStorage.setItem(STORAGE_KEY, "1") } catch { /* ignore */ }
    setDismissed(true)
  }

  return (
    <div
      role="status"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 30,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 14,
        padding: "9px 18px",
        background: palette.bg,
        borderBottom: palette.border,
        fontFamily: "var(--font-inter), sans-serif",
        fontSize: 13,
        fontWeight: 500,
        color: palette.color,
        backdropFilter: "blur(6px)",
      }}
    >
      <span
        aria-hidden
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: palette.accent,
          flexShrink: 0,
        }}
      />
      <span style={{ flex: "0 1 auto" }}>
        {isExpired
          ? "Période d'essai terminée. "
          : isWarning
          ? `Plus que ${status.daysLeft} jour${status.daysLeft > 1 ? "s" : ""} d'essai. `
          : `Essai gratuit — il vous reste ${status.daysLeft} jours. `}
        <Link
          href="/contact"
          style={{
            color: palette.accent,
            fontWeight: 700,
            textDecoration: "underline",
            textUnderlineOffset: 2,
          }}
        >
          {isExpired ? "Contactez-nous pour activer votre abonnement" : "Discutons abonnement"}
        </Link>
      </span>
      {!alwaysVisible && !isExpired && status.daysLeft >= 4 && (
        <button
          onClick={dismiss}
          aria-label="Masquer pour la session"
          style={{
            marginLeft: 4,
            background: "transparent",
            border: "none",
            color: palette.color,
            opacity: 0.6,
            cursor: "pointer",
            fontSize: 16,
            lineHeight: 1,
            padding: 2,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = "1" }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.6" }}
        >
          ×
        </button>
      )}
    </div>
  )
}
