"use client"

import { useState } from "react"
import Link from "next/link"
import type { Organization } from "@/lib/database.types"
import { trialStatus } from "@/lib/trial"
import { isInLockdown } from "@/lib/subscription"
import { useLanguage } from "@/lib/i18n/LanguageContext"

const copy = {
  fr: {
    ctaDiscuss: "Discutons abonnement",
    paymentFailed: "Échec du dernier prélèvement. ",
    ctaUpdatePayment: "Mettre à jour mon moyen de paiement",
    subCanceled: "Abonnement annulé. ",
    ctaResubscribe: "Souscrire à nouveau",
    trialEndingStripe: (n: number) => `Période d'essai Stripe terminée dans ${n} jour${n > 1 ? "s" : ""}. `,
    renewingIn: (n: number) => `Renouvellement de votre abonnement dans ${n} jour${n > 1 ? "s" : ""}. `,
    ctaManageSub: "Gérer mon abonnement",
    trialExpired: "Période d'essai terminée. ",
    ctaSubscribePackage: "Souscrire au Package Sourcing",
    trialWarning: (n: number) => `Plus que ${n} jour${n > 1 ? "s" : ""} d'essai. `,
    ctaSubscribeNow: "Souscrire maintenant",
    trialInfo: (n: number) => `Essai gratuit — il vous reste ${n} jours. `,
    dismissAria: "Masquer pour la session",
  },
  en: {
    ctaDiscuss: "Let's talk subscription",
    paymentFailed: "Your last payment failed. ",
    ctaUpdatePayment: "Update my payment method",
    subCanceled: "Subscription canceled. ",
    ctaResubscribe: "Subscribe again",
    trialEndingStripe: (n: number) => `Stripe trial ends in ${n} day${n > 1 ? "s" : ""}. `,
    renewingIn: (n: number) => `Your subscription renews in ${n} day${n > 1 ? "s" : ""}. `,
    ctaManageSub: "Manage my subscription",
    trialExpired: "Trial period ended. ",
    ctaSubscribePackage: "Subscribe to Package Sourcing",
    trialWarning: (n: number) => `Only ${n} day${n > 1 ? "s" : ""} left in your trial. `,
    ctaSubscribeNow: "Subscribe now",
    trialInfo: (n: number) => `Free trial — ${n} days left. `,
    dismissAria: "Dismiss for this session",
  },
}

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
  const { lang } = useLanguage()
  const t = copy[lang]
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

  // En lockdown : la LockdownBanner (rouge, non-dismissable) prend le
  // relais. On ne double pas avec un message d'essai/sub.
  if (isInLockdown(organization, nowMs)) return null

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
  let ctaLabel = t.ctaDiscuss
  let ctaHref = "/contact"

  if (subStatus === "past_due" || subStatus === "unpaid") {
    mode = "expired"
    message = t.paymentFailed
    ctaLabel = t.ctaUpdatePayment
    ctaHref = "/organisation?tab=abonnement&action=subscribe"
  } else if (subStatus === "canceled" || subStatus === "incomplete_expired") {
    mode = "expired"
    message = t.subCanceled
    ctaLabel = t.ctaResubscribe
    ctaHref = "/organisation?tab=abonnement&action=subscribe"
  } else if (
    (subStatus === "active" || subStatus === "trialing") &&
    daysToRenewal !== null && daysToRenewal >= 0 && daysToRenewal <= 5
  ) {
    mode = daysToRenewal <= 2 ? "warning" : "info"
    message = subStatus === "trialing"
      ? t.trialEndingStripe(daysToRenewal)
      : t.renewingIn(daysToRenewal)
    ctaLabel = t.ctaManageSub
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
      message = t.trialExpired
      ctaLabel = t.ctaSubscribePackage
      ctaHref = "/organisation?tab=abonnement&action=subscribe"
    } else if (status.daysLeft <= 3) {
      mode = "warning"
      message = t.trialWarning(status.daysLeft)
      ctaLabel = t.ctaSubscribeNow
      ctaHref = "/organisation?tab=abonnement&action=subscribe"
    } else {
      mode = "info"
      message = t.trialInfo(status.daysLeft)
      ctaLabel = t.ctaSubscribeNow
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
          aria-label={t.dismissAria}
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
