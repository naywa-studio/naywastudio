"use client"

import type { Organization } from "@/lib/database.types"
import { hasActiveAccess } from "@/lib/subscription"

/**
 * Bannière sticky non-dismissable affichée en haut du workspace pour
 * les MEMBERS quand l'org de leur owner n'a pas d'accès actif (pas de
 * trial activé, pas de sub Stripe). Le member voit le workspace mais
 * ne peut rien créer -- le contexte isReadOnly est posé en parallèle.
 *
 * S'affiche pour :
 *   - role=member
 *   - organisation sans hasActiveAccess
 *
 * Pas affichée pour l'owner (lui voit la bannière trial / lockdown
 * habituelle avec ses propres CTAs).
 */

interface Props {
  organization: Organization | null | undefined
  role: "owner" | "member" | undefined
}

export function MemberWaitingBanner({ organization, role }: Props) {
  if (!organization) return null
  if (role !== "member") return null
  if (hasActiveAccess(organization)) return null

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
        background: "#7C63C8", flexShrink: 0,
      }} />
      <span style={{ flex: "0 1 auto" }}>
        L&apos;owner de <strong>{orgName}</strong> n&apos;a pas encore
        souscrit à un package. Vous pouvez consulter le workspace
        mais pas le modifier tant que l&apos;accès n&apos;est pas activé.
      </span>
    </div>
  )
}
