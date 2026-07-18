"use client"

import { useState } from "react"
import Link from "next/link"
import type { Organization } from "@/lib/database.types"
import { graceInfo } from "@/lib/subscription"
import { useLanguage } from "@/lib/i18n/LanguageContext"

const copy = {
  fr: {
    leadDeletion: "Suppression programmée.",
    leadSubscription: "Abonnement résilié — workspace en lecture seule.",
    leadTrial: "Essai terminé — workspace en lecture seule.",
    daysLeft: (n: number) => (
      <>Plus que <strong>{n} jour{n > 1 ? "s" : ""}</strong> avant la suppression des données. </>
    ),
    soon: "Suppression des données dans les prochaines heures. ",
    cancelDeletion: "Annuler la suppression",
    reactivateSub: "Réactiver l'abonnement",
    subscribe: "Souscrire",
    exportData: "Exporter mes données",
    askOwnerDeletion: "L'organisation va être supprimée par son propriétaire. ",
    askOwnerSub: "Demandez à l'owner de régulariser l'abonnement. ",
  },
  en: {
    leadDeletion: "Deletion scheduled.",
    leadSubscription: "Subscription canceled — workspace in read-only mode.",
    leadTrial: "Trial ended — workspace in read-only mode.",
    daysLeft: (n: number) => (
      <>Only <strong>{n} day{n > 1 ? "s" : ""}</strong> left before your data is deleted. </>
    ),
    soon: "Data will be deleted within the next few hours. ",
    cancelDeletion: "Cancel the deletion",
    reactivateSub: "Reactivate my subscription",
    subscribe: "Subscribe",
    exportData: "Export my data",
    askOwnerDeletion: "The organization is about to be deleted by its owner. ",
    askOwnerSub: "Ask the owner to settle the subscription. ",
  },
}

/**
 * Bannière rouge persistante en haut du workspace quand l'org est en
 * fenêtre de grâce (lecture seule avant wipe). Couvre les 3 causes
 * (cf. lib/subscription.ts `graceInfo`) :
 *   - "deletion"     : suppression programmée par l'owner → CTA "Annuler".
 *   - "subscription" : abonnement résilié / impayé → CTA "Réactiver".
 *   - "trial"        : essai gratuit expiré → CTA "Souscrire".
 *
 * Non-dismissable. Le workspace reste en lecture seule pendant toute la
 * période pour permettre l'export RGPD. Les CTA d'action (souscrire /
 * réactiver / annuler) ne sont rendus que pour l'owner ; un member voit
 * le countdown + le lien d'export.
 */

interface Props {
  organization: Organization | null | undefined
  isOwner?: boolean
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

export function LockdownBanner({ organization, isOwner = true }: Props) {
  const { lang } = useLanguage()
  const t = copy[lang]
  // Date.now() capturé au mount via useState init (pattern react-hooks/purity).
  const [nowMs] = useState(() => Date.now())

  if (!organization) return null
  const grace = graceInfo(organization, nowMs)
  // On affiche la bannière tant qu'il y a une cause de grâce, même si la
  // fenêtre est techniquement écoulée (le wipe n'a pas encore tourné) — dans
  // ce cas daysLeft tombe à 0 et le message bascule sur "imminent".
  if (!grace.cause || !grace.endsAt) return null

  const daysLeft = Math.max(0, Math.ceil((grace.endsAt.getTime() - nowMs) / MS_PER_DAY))

  const lead =
    grace.cause === "deletion"
      ? t.leadDeletion
      : grace.cause === "subscription"
        ? t.leadSubscription
        : t.leadTrial

  const countdown = daysLeft > 0 ? t.daysLeft(daysLeft) : t.soon

  // CTA principal selon la cause.
  const primary =
    grace.cause === "deletion"
      ? { href: "/organisation?tab=securite", label: t.cancelDeletion }
      : { href: "/organisation?action=subscribe", label: grace.cause === "subscription" ? t.reactivateSub : t.subscribe }

  return (
    <div
      role="alert"
      style={{
        position: "sticky", top: 0, zIndex: 30,
        display: "flex", alignItems: "center", justifyContent: "center",
        gap: 14,
        padding: "9px 18px",
        background: "linear-gradient(90deg, rgba(254,226,226,0.95) 0%, rgba(254,202,202,0.95) 100%)",
        borderBottom: "1px solid rgba(239,68,68,0.32)",
        fontFamily: "var(--font-inter), sans-serif",
        fontSize: 13, fontWeight: 500,
        color: "#991B1B",
        backdropFilter: "blur(6px)",
      }}
    >
      <span aria-hidden style={{
        width: 8, height: 8, borderRadius: "50%",
        background: "#DC2626", flexShrink: 0,
      }} />
      <span style={{ flex: "0 1 auto" }}>
        {lead} {countdown}
        {isOwner ? (
          <>
            <Link
              href={primary.href}
              style={{ color: "#DC2626", fontWeight: 700, textDecoration: "underline", textUnderlineOffset: 2 }}
            >
              {primary.label}
            </Link>
            {" "}·{" "}
            <Link
              href="/organisation?tab=securite"
              style={{ color: "#DC2626", fontWeight: 700, textDecoration: "underline", textUnderlineOffset: 2 }}
            >
              {t.exportData}
            </Link>
          </>
        ) : (
          <>
            {grace.cause === "deletion" ? t.askOwnerDeletion : t.askOwnerSub}
            <Link
              href="/organisation?tab=securite"
              style={{ color: "#DC2626", fontWeight: 700, textDecoration: "underline", textUnderlineOffset: 2 }}
            >
              {t.exportData}
            </Link>
          </>
        )}
      </span>
    </div>
  )
}
