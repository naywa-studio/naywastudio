"use client"

import { useState } from "react"
import type { Organization } from "@/lib/database.types"
import { hasActiveAccess, graceInfo } from "@/lib/subscription"
import { useLanguage } from "@/lib/i18n/LanguageContext"

const copy = {
  fr: {
    message: (orgName: string) => (
      <>Vous consultez <strong>{orgName}</strong> en lecture seule — aucun
        siège ne vous est attribué. Demandez un siège à l&apos;owner pour
        créer et modifier.</>
    ),
  },
  en: {
    message: (orgName: string) => (
      <>You are viewing <strong>{orgName}</strong> in read-only mode — no seat
        is assigned to you. Ask the owner for a seat to create and edit.</>
    ),
  },
}

/**
 * Bannière sticky affichée en haut du workspace pour un membre de l'org SANS
 * SIÈGE alors que l'org a bien un accès actif. Il peut tout consulter mais rien
 * muter (garde serveur requireActiveAccess + isReadOnly côté UI). Couvre aussi
 * bien l'owner sans siège (qui n'est plus bounce hors du workspace) que le
 * membre invité dont l'owner n'a pas encore alloué de siège.
 *
 * Ne s'affiche PAS quand :
 *   - l'user a un siège (accès complet),
 *   - l'org n'a pas d'accès actif → c'est MemberWaitingBanner / TrialBanner /
 *     LockdownBanner qui expliquent (on ne double pas le message),
 *   - une fenêtre de grâce est en cours (LockdownBanner prend le relais).
 * Le parent ne la monte que pour les non-admins.
 */

interface Props {
  organization: Organization | null | undefined
  hasSeat: boolean
}

export function SeatReadOnlyBanner({ organization, hasSeat }: Props) {
  const { lang } = useLanguage()
  const t = copy[lang]
  // Date.now() capturé au mount (pattern react-hooks/purity).
  const [nowMs] = useState(() => Date.now())
  if (!organization) return null
  if (hasSeat) return null
  // Sans accès actif ou en grâce : d'autres bannières portent déjà le message.
  if (!hasActiveAccess(organization)) return null
  if (graceInfo(organization, nowMs).cause) return null

  const orgName = organization.brand_name ?? organization.name

  return (
    <div
      role="status"
      style={{
        position: "sticky", top: 0, zIndex: 30,
        display: "flex", alignItems: "center", justifyContent: "center",
        gap: 14, padding: "9px 18px",
        background: "linear-gradient(90deg, rgba(243,232,255,0.95) 0%, rgba(233,213,255,0.95) 100%)",
        borderBottom: "1px solid rgba(124,99,200,0.25)",
        fontFamily: "var(--font-inter), sans-serif",
        fontSize: 13, fontWeight: 500,
        color: "#5B45A8",
        backdropFilter: "blur(6px)",
      }}
    >
      <span aria-hidden style={{
        width: 8, height: 8, borderRadius: "50%",
        background: "var(--nw-primary)", flexShrink: 0,
      }} />
      <span style={{ flex: "0 1 auto" }}>
        {t.message(orgName)}
      </span>
    </div>
  )
}
