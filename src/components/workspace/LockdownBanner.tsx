"use client"

import { useState } from "react"
import Link from "next/link"
import type { Organization } from "@/lib/database.types"
import { isInLockdown } from "@/lib/subscription"

/**
 * Bannière rouge persistante affichée en haut du workspace quand l'org
 * est en lockdown (sub past_due / unpaid / canceled, dans la fenêtre
 * de 15 j avant le wipe data). Non-dismissable — l'owner doit voir le
 * problème à chaque navigation.
 *
 * Le workspace reste accessible en lecture seule pendant cette période
 * pour permettre l'export RGPD.
 */

interface Props {
  organization: Organization | null | undefined
  /** True = owner du cabinet. Les CTAs "Souscrire à nouveau" /
   *  "Régulariser" ne sont rendus que pour l'owner ; un member voit
   *  juste le countdown et le lien export RGPD. */
  isOwner?: boolean
}

export function LockdownBanner({ organization, isOwner = true }: Props) {
  // Date.now() capturé au mount via useState init (pattern react-hooks/purity).
  const [nowMs] = useState(() => Date.now())

  if (!organization) return null
  if (!isInLockdown(organization, nowMs)) return null

  const startMs = new Date(organization.lockdown_started_at!).getTime()
  const elapsedMs = nowMs - startMs
  const daysLeft = Math.max(0, 15 - Math.floor(elapsedMs / (24 * 60 * 60 * 1000)))

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
        Workspace en lecture seule. {daysLeft > 0
          ? <>Plus que <strong>{daysLeft} jour{daysLeft > 1 ? "s" : ""}</strong> avant la suppression des données. </>
          : <>Suppression des données dans les prochaines heures. </>}
        {isOwner ? (
          <>
            <Link
              href="/organisation?action=subscribe"
              style={{
                color: "#DC2626", fontWeight: 700,
                textDecoration: "underline", textUnderlineOffset: 2,
              }}
            >
              Souscrire à nouveau
            </Link>
            {" "}·{" "}
            <Link
              href="/organisation?tab=securite"
              style={{
                color: "#DC2626", fontWeight: 700,
                textDecoration: "underline", textUnderlineOffset: 2,
              }}
            >
              Exporter mes données
            </Link>
          </>
        ) : (
          <>
            Demandez à l&apos;owner de régulariser l&apos;abonnement.{" "}
            <Link
              href="/organisation?tab=securite"
              style={{
                color: "#DC2626", fontWeight: 700,
                textDecoration: "underline", textUnderlineOffset: 2,
              }}
            >
              Exporter mes données
            </Link>
          </>
        )}
      </span>
    </div>
  )
}
