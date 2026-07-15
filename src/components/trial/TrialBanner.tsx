"use client"

import { useState } from "react"
import Link from "next/link"
import type { Organization } from "@/lib/database.types"
import { trialStatus } from "@/lib/trial"
import { graceInfo } from "@/lib/subscription"

/**
 * Sticky banner sur /organisation et /workspace.
 *
 * Couvre 4 cas, prioritisés dans cet ordre :
 *   1. subscription past_due / unpaid   -> ROUGE (action requise)
 *   2. trial expired sans sub           -> ROUGE
 *   3. trial <= 3 j sans sub            -> AMBRE
 *   4. trial 4-15 j ou sub renew < 5 j  -> VIOLET informationnel
 *
 * Rien ne s'affiche si :
 *   - le trial n'est pas activé (l'onboarding gère ce cas)
 *   - une sub Stripe est active et le renouvellement est > 5 j
 */

interface Props {
  organization: Organization | null | undefined
  /** True = owner du cabinet. Les CTAs "Souscrire" / "Régulariser" ne
   *  sont rendus que pour l'owner ; un member voit le statut sans action. */
  isOwner?: boolean
  /** Hide the dismiss button. Default false. */
  alwaysVisible?: boolean
  /** True si le caller est un admin Naywa : aucune bannière n'est
   *  affichée (bypass paywall complet). */
  isAdmin?: boolean
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

export function TrialBanner({ organization, isOwner = true, alwaysVisible = false, isAdmin = false }: Props) {
  // État local pour pouvoir re-render quand l'utilisateur clique sur la
  // croix. La valeur initiale lit sessionStorage côté client uniquement
  // (en SSR on retourne false ; il y aura un éventuel flash 1 frame puis
  // le re-render client cache la bannière si elle était déjà fermée).
  const [dismissed, setDismissed] = useState(readDismissed)
  // Date.now() capturé au mount (pattern react-hooks/purity, idem
  // `dismissed` au-dessus). Hooks toujours appelés en premier — pas
  // de return conditionnel entre eux.
  const [nowMs] = useState(() => Date.now())

  // Admin Naywa : aucun gate paywall, aucune bannière. On bypass avant
  // toute autre vérif pour éviter qu'un admin connecté sur un compte
  // "trial pending" voie la bannière violette.
  if (isAdmin) return null

  if (!organization) return null

  // En fenêtre de grâce (résiliation / impayé / essai expiré / suppression
  // programmée) : la LockdownBanner (rouge, non-dismissable) prend le relais.
  // On ne double pas avec un message d'essai/sub.
  if (graceInfo(organization, nowMs).cause) return null

  // Subscription Stripe a la priorité — si elle est past_due, expired
  // ou renouvellement imminent, c'est ce qu'on affiche, pas le trial.
  const subStatus = organization.subscription_status
  const daysToRenewal = (() => {
    if (!organization.current_period_end) return null
    const end = new Date(organization.current_period_end).getTime()
    return Math.ceil((end - nowMs) / (24 * 60 * 60 * 1000))
  })()

  let mode: "info" | "warning" | "expired" = "info"
  let message: string | null = null
  let ctaLabel = "Discutons abonnement"
  let ctaHref = "/contact"

  if (subStatus === "past_due" || subStatus === "unpaid") {
    mode = "expired"
    message = "Échec du dernier prélèvement. "
    ctaLabel = "Mettre à jour mon moyen de paiement"
    ctaHref = "/organisation?tab=abonnement&action=subscribe"
  } else if (subStatus === "canceled" || subStatus === "incomplete_expired") {
    mode = "expired"
    message = "Abonnement annulé. "
    ctaLabel = "Souscrire à nouveau"
    ctaHref = "/organisation?tab=abonnement&action=subscribe"
  } else if (
    (subStatus === "active" || subStatus === "trialing") &&
    daysToRenewal !== null && daysToRenewal >= 0 && daysToRenewal <= 5
  ) {
    mode = daysToRenewal <= 2 ? "warning" : "info"
    message = subStatus === "trialing"
      ? `Période d'essai Stripe terminée dans ${daysToRenewal} jour${daysToRenewal > 1 ? "s" : ""}. `
      : `Renouvellement de votre abonnement dans ${daysToRenewal} jour${daysToRenewal > 1 ? "s" : ""}. `
    ctaLabel = "Gérer mon abonnement"
    ctaHref = "/organisation?tab=abonnement&action=subscribe"
  } else if (
    subStatus === "active" || subStatus === "trialing"
  ) {
    // Sub Stripe saine + renouvellement loin -> on cache la bannière.
    return null
  } else {
    // Pas de sub Stripe -> on tombe sur l'ancienne logique de trial.
    const status = trialStatus(organization)
    if (status.state === "pending") return null

    if (status.state === "expired") {
      mode = "expired"
      message = "Période d'essai terminée. "
      ctaLabel = "Souscrire au Package Sourcing"
      ctaHref = "/organisation?tab=abonnement&action=subscribe"
    } else if (status.daysLeft <= 3) {
      mode = "warning"
      message = `Plus que ${status.daysLeft} jour${status.daysLeft > 1 ? "s" : ""} d'essai. `
      ctaLabel = "Souscrire maintenant"
      ctaHref = "/organisation?tab=abonnement&action=subscribe"
    } else {
      mode = "info"
      message = `Essai gratuit — il vous reste ${status.daysLeft} jours. `
      ctaLabel = "Souscrire maintenant"
      ctaHref = "/organisation?tab=abonnement&action=subscribe"
    }
  }

  if (!message) return null

  // Le dismiss n'est honoré que pour les bannières "info". En warning
  // ou expired, l'owner doit voir le pb à chaque chargement.
  const dismissAllowed = !alwaysVisible && mode === "info"
  if (dismissed && dismissAllowed) return null

  const isExpired = mode === "expired"
  const isWarning = mode === "warning"

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
        {message}
        {isOwner && (
          <Link
            href={ctaHref}
            style={{
              color: palette.accent,
              fontWeight: 700,
              textDecoration: "underline",
              textUnderlineOffset: 2,
            }}
          >
            {ctaLabel}
          </Link>
        )}
      </span>
      {!alwaysVisible && mode === "info" && (
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
