/**
 * GET /api/mailing/oauth/google/callback
 *
 * Le retour du consentement Google. Échange le code contre un jeton durable,
 * le chiffre, l'enregistre, et renvoie le sourceur sur son écran.
 *
 * ── DEUX contrôles sur l'identité, pas un ────────────────────────────────
 *
 * 1. **L'état signé** prouve que cette redirection est bien la suite d'un
 *    `start` que nous avons émis.
 * 2. **L'utilisateur de l'état doit être celui de la SESSION.** Google
 *    redirige vers une URL fixe ; sans ce second contrôle, quelqu'un pourrait
 *    faire ouvrir à un sourceur connecté un lien de retour portant un état
 *    valide obtenu ailleurs, et lui rattacher une boîte qui n'est pas la
 *    sienne. Ses messages candidats partiraient alors depuis l'adresse d'un
 *    inconnu, sans que rien ne le signale.
 *
 * ── Pourquoi des redirections et pas du JSON ─────────────────────────────
 *
 * C'est un navigateur qui atterrit ici, au milieu d'un parcours. Une erreur
 * doit le ramener à son écran avec un motif affichable, pas lui montrer une
 * page d'erreur brute.
 */

import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { getAdminSupabase } from "@/lib/admin-supabase"
import { getCapabilities } from "@/lib/capabilities"
import { hasMailingAccess } from "@/lib/subscription"
import { mailingVisible } from "@/lib/mailing/rollout"
import { exchangeGoogleCode, readState } from "@/lib/mailing/oauth-google"
import { encryptToken } from "@/lib/mailing/token-crypto"
import { getAppUrl } from "@/lib/stripe"

export const runtime = "nodejs"
export const maxDuration = 30

function back(appUrl: string, params: string): NextResponse {
  return NextResponse.redirect(`${appUrl}/organisation?tab=mailing&${params}`)
}

export async function GET(req: NextRequest) {
  const appUrl = getAppUrl(req).replace(/\/+$/, "")
  const url = req.nextUrl

  // L'utilisateur a cliqué « Annuler » sur l'écran Google : ce n'est pas une
  // erreur, c'est une décision. On le ramène sans rien dramatiser.
  const denied = url.searchParams.get("error")
  if (denied) return back(appUrl, `mailbox_error=${denied === "access_denied" ? "cancelled" : "denied"}`)

  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.redirect(`${appUrl}/login?next=/organisation`)

  const stateUser = readState(url.searchParams.get("state"))
  if (!stateUser || stateUser !== user.id) {
    console.error("[oauth/google] état invalide ou d'un autre utilisateur")
    return back(appUrl, "mailbox_error=invalid_state")
  }

  const code = url.searchParams.get("code")
  if (!code) return back(appUrl, "mailbox_error=no_code")

  const admin = getAdminSupabase()
  const { data: profile } = await admin
    .from("profiles")
    .select("user_id, organization_id, role, is_admin, can_manage_branding, can_manage_pricing, can_manage_team, has_sourcing_seat")
    .eq("user_id", user.id)
    .single()
  if (!profile) return back(appUrl, "mailbox_error=no_profile")

  const { data: org } = await admin
    .from("organizations").select("*").eq("id", profile.organization_id).single()
  if (!org) return back(appUrl, "mailbox_error=no_org")

  // Revérifié au retour : l'accès a pu être révoqué pendant que le sourceur
  // était sur l'écran Google. Un jeton stocké pour une org qui n'a plus
  // l'option serait un accès à une messagerie qu'on n'a pas le droit d'avoir.
  const caps = getCapabilities(profile)
  if (!mailingVisible(profile, org) || !hasMailingAccess(org, { isAdmin: caps.isAdminNaywa })) {
    return back(appUrl, "mailbox_error=mailing_not_included")
  }

  let tokens
  try {
    tokens = await exchangeGoogleCode(code, appUrl)
  } catch (err) {
    console.error("[oauth/google] échange impossible:", (err as Error).message)
    return back(appUrl, "mailbox_error=exchange_failed")
  }

  /* Chiffré AVANT d'atteindre la base — cf. `token-crypto.ts`. Un jeton de
   * rafraîchissement permet d'envoyer au nom de quelqu'un indéfiniment. */
  const { error } = await admin.from("connected_mailboxes").upsert({
    organization_id: profile.organization_id,
    user_id: user.id,
    provider: "google",
    email: tokens.email,
    refresh_token_encrypted: encryptToken(tokens.refreshToken),
    // Reconnecter, c'est réparer : on efface l'état d'échec précédent, sinon
    // le bandeau « reconnectez votre boîte » survivrait à la reconnexion.
    status: "active",
    last_error: null,
    connected_at: new Date().toISOString(),
  }, { onConflict: "user_id,provider,email" })

  if (error) {
    console.error("[oauth/google] enregistrement impossible:", error.message)
    return back(appUrl, "mailbox_error=store_failed")
  }

  return back(appUrl, `mailbox_connected=${encodeURIComponent(tokens.email)}`)
}
