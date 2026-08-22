/**
 * POST /api/mailing/domain/verify
 *
 * Redemande au fournisseur de contrôler les enregistrements DNS, et met l'état
 * à jour. C'est le bouton « J'ai publié mes enregistrements, vérifiez ».
 *
 * ── Le seul endroit qui peut accorder `active` ────────────────────────────
 *
 * Et il ne l'accorde que sur la réponse du fournisseur, jamais sur une saisie
 * du client. La raison est la même que partout dans ce chantier : un domaine
 * marqué actif sans clés DKIM publiées ferait partir des emails non
 * authentifiés sous la marque du cabinet — droit en spam, sans que personne ne
 * voie d'erreur. Le cabinet croirait avoir contacté des candidats.
 *
 * ── Ce qui se déclenche au passage à `active` ─────────────────────────────
 *
 * Les adresses de réception des sourceurs basculent sur le nouveau domaine, en
 * conservant l'ancienne en alias (cf. `lib/mailing/inbox-address.ts` et la
 * migration 087). Fait ICI, à l'instant du basculement, plutôt qu'au prochain
 * envoi : le sourceur doit pouvoir lire sa nouvelle adresse dès que le domaine
 * est prêt, et non la découvrir après avoir écrit à quelqu'un.
 */

import { NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { getAdminSupabase } from "@/lib/admin-supabase"
import { getCapabilities } from "@/lib/capabilities"
import { hasMailingAccess } from "@/lib/subscription"
import { activeProvider } from "@/lib/mailing/send"
import { explainSesError } from "@/lib/mailing/ses"
import { switchOrgInboxAddresses } from "@/lib/mailing/inbox-address"

export const runtime = "nodejs"
export const maxDuration = 30

export async function POST() {
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })

  const admin = getAdminSupabase()
  const { data: profile } = await admin
    .from("profiles")
    .select("user_id, organization_id, role, is_admin, can_manage_branding, can_manage_pricing, can_manage_team, has_sourcing_seat")
    .eq("user_id", user.id)
    .single()
  if (!profile) return NextResponse.json({ error: "no_profile" }, { status: 403 })

  const caps = getCapabilities(profile)
  if (!caps.canBranding) return NextResponse.json({ error: "forbidden" }, { status: 403 })

  const { data: org } = await admin
    .from("organizations").select("*").eq("id", profile.organization_id).single()
  if (!org) return NextResponse.json({ error: "no_org" }, { status: 403 })
  if (!hasMailingAccess(org, { isAdmin: caps.isAdminNaywa })) {
    return NextResponse.json({ error: "mailing_not_included" }, { status: 403 })
  }
  if (!org.mailing_sending_domain) {
    return NextResponse.json(
      { error: "no_domain", message: "Déclarez d'abord votre nom de domaine." },
      { status: 400 },
    )
  }

  let state
  try {
    state = await activeProvider().verifySendingDomain(org.mailing_sending_domain)
  } catch (err) {
    console.error("[mailing/verify] fournisseur injoignable:", err)
    return NextResponse.json(
      { error: "provider_failed", message: explainSesError(err) },
      { status: 502 },
    )
  }

  const becameActive = state.status === "active" && org.mailing_status !== "active"

  const { error } = await admin.from("organizations").update({
    mailing_status: state.status,
    mailing_dns_records: state.records,
    mailing_verified_at: state.status === "active"
      ? (org.mailing_verified_at ?? new Date().toISOString())
      : null,
  }).eq("id", org.id)

  if (error) {
    console.error("[mailing/verify] écriture impossible:", error.message)
    return NextResponse.json({ error: "store_failed", detail: "internal_error" }, { status: 500 })
  }

  /* ── Bascule des adresses de réception ─────────────────────────────────
   *
   * Best-effort, et volontairement : un échec ici ne doit pas faire échouer
   * une vérification qui a RÉUSSI. Le domaine est authentifié, c'est le fait
   * important ; une adresse non basculée le sera au premier envoi, puisque
   * `ensureInboxAddress` est appelé là aussi. L'inverse — annuler la
   * vérification parce qu'une adresse n'a pas bougé — ferait perdre au client
   * une étape DNS qu'il vient de franchir. */
  const switched = becameActive
    ? await switchOrgInboxAddresses(
        admin,
        { ...org, mailing_status: state.status },
        { isAdmin: caps.isAdminNaywa },
      )
    : 0

  return NextResponse.json({
    ok: true,
    status: state.status,
    records: state.records,
    became_active: becameActive,
    addresses_switched: switched,
  })
}
