/**
 * GET /api/mailing/oauth/google/start
 *
 * Envoie le sourceur vers l'écran de consentement Google. Répond par une
 * REDIRECTION, pas par du JSON : c'est un navigateur qui arrive ici, pas un
 * appel programmatique.
 *
 * ── Ce qui est vérifié avant de rediriger ────────────────────────────────
 *
 * L'authentification, l'accès actif, l'option Mailing et le garde-fou de
 * lancement. Rediriger d'abord et refuser au retour ferait passer le sourceur
 * par l'écran d'autorisation Google — donc lui ferait accorder un accès à sa
 * messagerie — pour rien. On ne demande pas une permission qu'on ne pourra
 * pas honorer.
 */

import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { getAdminSupabase } from "@/lib/admin-supabase"
import { getCapabilities } from "@/lib/capabilities"
import { hasMailingAccess } from "@/lib/subscription"
import { mailingVisible } from "@/lib/mailing/rollout"
import { googleAuthUrl, googleOAuthConfigured, signState } from "@/lib/mailing/oauth-google"
import { canStoreTokens } from "@/lib/mailing/token-crypto"
import { getAppUrl } from "@/lib/stripe"

export const runtime = "nodejs"

/** Renvoie le sourceur sur son écran avec un motif lisible. */
function back(appUrl: string, reason: string): NextResponse {
  return NextResponse.redirect(`${appUrl}/organisation?tab=mailing&mailbox_error=${reason}`)
}

export async function GET(req: NextRequest) {
  const appUrl = getAppUrl(req).replace(/\/+$/, "")

  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.redirect(`${appUrl}/login?next=/organisation`)

  const admin = getAdminSupabase()
  const { data: profile } = await admin
    .from("profiles")
    .select("user_id, organization_id, role, is_admin, can_manage_branding, can_manage_pricing, can_manage_team, has_sourcing_seat")
    .eq("user_id", user.id)
    .single()
  if (!profile) return back(appUrl, "no_profile")

  const { data: org } = await admin
    .from("organizations").select("*").eq("id", profile.organization_id).single()
  if (!org) return back(appUrl, "no_org")

  const caps = getCapabilities(profile)
  if (!mailingVisible(profile, org) || !hasMailingAccess(org, { isAdmin: caps.isAdminNaywa })) {
    return back(appUrl, "mailing_not_included")
  }

  /* Deux vérifications de configuration AVANT le consentement.
   *
   * Sans elles, le sourceur autoriserait Naywa à envoyer en son nom, puis on
   * échouerait au retour faute de secret ou de clé de chiffrement — après lui
   * avoir fait accorder un accès à sa messagerie. C'est le pire moment pour
   * découvrir qu'on n'était pas prêt. */
  if (!googleOAuthConfigured()) return back(appUrl, "not_configured")
  if (!canStoreTokens()) return back(appUrl, "not_configured")

  // `login_hint` pré-remplit le sélecteur de compte sans l'imposer : un
  // sourceur peut vouloir connecter une adresse d'équipe plutôt que la sienne.
  return NextResponse.redirect(googleAuthUrl(appUrl, signState(user.id), user.email ?? undefined))
}
