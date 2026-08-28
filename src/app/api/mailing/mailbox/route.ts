/**
 * La boîte connectée du sourceur — état et déconnexion.
 *
 *   GET     → quelle adresse est connectée, et fonctionne-t-elle encore ?
 *   DELETE  → déconnecter.
 *
 * ── Ce que le GET ne renvoie JAMAIS ──────────────────────────────────────
 *
 * Le jeton. La table n'a d'ailleurs aucune policy de lecture : même le
 * propriétaire de la ligne ne peut pas l'atteindre depuis son navigateur.
 * L'interface a besoin de savoir QUELLE adresse est connectée et si elle
 * marche — pas du secret qui permet d'envoyer en son nom.
 *
 * ── Chacun sa boîte ──────────────────────────────────────────────────────
 *
 * Filtré sur `user_id`, jamais sur l'organisation : une boîte mail est
 * personnelle. Un collègue n'a pas à savoir laquelle un autre a connectée, et
 * encore moins à la déconnecter.
 */

import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { getAdminSupabase } from "@/lib/admin-supabase"
import { getCapabilities } from "@/lib/capabilities"
import { hasMailingAccess } from "@/lib/subscription"
import { mailingVisible } from "@/lib/mailing/rollout"
import { googleOAuthConfigured } from "@/lib/mailing/oauth-google"

export const runtime = "nodejs"

async function gate() {
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) {
    return { ok: false as const, response: NextResponse.json({ error: "unauthenticated" }, { status: 401 }) }
  }

  const admin = getAdminSupabase()
  const { data: profile } = await admin
    .from("profiles")
    .select("user_id, organization_id, role, is_admin, can_manage_branding, can_manage_pricing, can_manage_team, has_sourcing_seat")
    .eq("user_id", user.id)
    .single()
  if (!profile) {
    return { ok: false as const, response: NextResponse.json({ error: "no_profile" }, { status: 403 }) }
  }

  const { data: org } = await admin
    .from("organizations").select("*").eq("id", profile.organization_id).single()
  if (!org) {
    return { ok: false as const, response: NextResponse.json({ error: "no_org" }, { status: 403 }) }
  }

  const caps = getCapabilities(profile)
  if (!mailingVisible(profile, org) || !hasMailingAccess(org, { isAdmin: caps.isAdminNaywa })) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "mailing_not_included", message: "L'option Mailing n'est pas incluse dans votre formule." },
        { status: 403 },
      ),
    }
  }

  return { ok: true as const, admin, userId: user.id }
}

export async function GET() {
  const g = await gate()
  if (!g.ok) return g.response

  const { data } = await g.admin
    .from("connected_mailboxes")
    .select("provider, email, status, last_error, connected_at, last_used_at")
    .eq("user_id", g.userId)
    .order("connected_at", { ascending: false })

  return NextResponse.json({
    ok: true,
    mailboxes: data ?? [],
    // L'interface doit pouvoir masquer le bouton plutôt que proposer une
    // connexion qui échouera faute de configuration serveur.
    providers: { google: googleOAuthConfigured() },
  })
}

/**
 * DELETE ?email=… — déconnecte une boîte.
 *
 * On supprime la ligne, donc le jeton. Google conserve l'autorisation de son
 * côté : le sourceur peut aussi la révoquer depuis son compte Google, et
 * c'est le seul geste qui la coupe vraiment. Le lui dire dans l'interface
 * plutôt que de laisser croire qu'un clic ici retire tout.
 */
export async function DELETE(req: NextRequest) {
  const g = await gate()
  if (!g.ok) return g.response

  const email = req.nextUrl.searchParams.get("email")
  if (!email) return NextResponse.json({ error: "missing_email" }, { status: 400 })

  const { error } = await g.admin
    .from("connected_mailboxes")
    .delete()
    .eq("user_id", g.userId)   // jamais sur l'organisation : chacun sa boîte
    .eq("email", email.toLowerCase())

  if (error) {
    console.error("[mailing/mailbox] suppression impossible:", error.message)
    return NextResponse.json({ error: "delete_failed", detail: "internal_error" }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
