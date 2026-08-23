/**
 * POST /api/mailing/domain/delegate   { email }
 *
 * Envoie la mise en route DNS au contact technique du cabinet.
 *
 * ── Pourquoi cette route existe ──────────────────────────────────────────
 *
 * Le sourceur qui achète l'option n'a presque jamais les accès DNS. C'est son
 * prestataire informatique, son agence web, ou un associé qui les détient.
 * Sans ce chemin, la mise en route se termine en copier-coller d'un email
 * technique vers quelqu'un d'autre — et la moitié s'arrête là.
 *
 * ── Ce que le lien permet, et surtout ce qu'il ne permet PAS ─────────────
 *
 * Il donne accès à DEUX choses : lire les enregistrements à publier, et
 * demander une vérification. Rien d'autre.
 *
 * Il ne permet pas de changer le domaine, ni de voir un candidat, une
 * mission, ou quoi que ce soit du workspace. C'est important : le
 * destinataire est un tiers que Naywa n'authentifie pas, désigné par le
 * client. Les enregistrements eux-mêmes ne sont pas des secrets — ils sont
 * destinés à être publiés dans un DNS public.
 *
 * Le lien expire (cf. DELEGATE_LINK_DAYS) et le renvoyer en fabrique un
 * nouveau, ce qui invalide le précédent.
 */

import { NextResponse } from "next/server"
import { randomUUID } from "node:crypto"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { getAdminSupabase } from "@/lib/admin-supabase"
import { getCapabilities } from "@/lib/capabilities"
import { hasMailingAccess } from "@/lib/subscription"
import { mailingVisible } from "@/lib/mailing/rollout"
import { sendEmail, MAIL_DOMAIN } from "@/lib/resend"
import { DELEGATE_LINK_DAYS } from "@/lib/mailing/verify-domain"

export const runtime = "nodejs"

/** Suffisant pour écarter une faute de frappe, sans prétendre valider un email. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "https://naywastudio.com").replace(/\/+$/, "")
}

export async function POST(req: Request) {
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as { email?: unknown }
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : ""
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json(
      { error: "invalid_email", message: "Indiquez une adresse email valide." },
      { status: 400 },
    )
  }

  const admin = getAdminSupabase()
  const { data: profile } = await admin
    .from("profiles")
    .select("user_id, organization_id, role, is_admin, first_name, can_manage_branding, can_manage_pricing, can_manage_team, has_sourcing_seat")
    .eq("user_id", user.id)
    .single()
  if (!profile) return NextResponse.json({ error: "no_profile" }, { status: 403 })

  const caps = getCapabilities(profile)
  if (!caps.canBranding) return NextResponse.json({ error: "forbidden" }, { status: 403 })

  const { data: org } = await admin
    .from("organizations").select("*").eq("id", profile.organization_id).single()
  if (!org) return NextResponse.json({ error: "no_org" }, { status: 403 })
  if (!mailingVisible(profile, org) || !hasMailingAccess(org, { isAdmin: caps.isAdminNaywa })) {
    return NextResponse.json({ error: "mailing_not_included" }, { status: 403 })
  }
  if (!org.mailing_sending_domain) {
    return NextResponse.json(
      { error: "no_domain", message: "Déclarez d'abord votre nom de domaine." },
      { status: 400 },
    )
  }
  if (org.mailing_status === "active") {
    return NextResponse.json(
      { error: "already_active", message: "Votre domaine est déjà vérifié." },
      { status: 400 },
    )
  }

  // Un jeton neuf à chaque envoi : le précédent cesse de fonctionner. Un lien
  // qui traîne dans une boîte mail ne doit pas rester utilisable indéfiniment
  // parce que quelqu'un a relancé la demande.
  const token = randomUUID()
  const { error } = await admin.from("organizations").update({
    mailing_delegate_email: email,
    mailing_delegate_token: token,
    mailing_delegate_sent_at: new Date().toISOString(),
  }).eq("id", org.id)

  if (error) {
    console.error("[mailing/delegate] écriture impossible:", error.message)
    return NextResponse.json({ error: "store_failed", detail: "internal_error" }, { status: 500 })
  }

  const link = `${appUrl()}/mailing-setup?token=${token}`
  const orgName = (org.brand_name || org.name || "votre client").replace(/[\r\n]+/g, " ")
  const asker = profile.first_name?.trim() || "L'équipe"

  try {
    // Envoyé depuis le domaine de NAYWA, et c'est voulu : c'est Naywa qui
    // écrit, en son nom, à un tiers. Le domaine du client n'est justement pas
    // encore authentifié — s'en servir enverrait ce message en indésirables.
    await sendEmail({
      from: `Naywa Studio <contact@${MAIL_DOMAIN}>`,
      to: email,
      replyTo: user.email ?? `contact@${MAIL_DOMAIN}`,
      subject: `Configuration DNS pour ${orgName}`,
      text: [
        `Bonjour,`,
        ``,
        `${asker} (${orgName}) met en place l'envoi d'emails depuis le domaine`,
        `${org.mailing_sending_domain} et vous a désigné comme contact technique.`,
        ``,
        `Il y a quelques enregistrements DNS à publier. Cette page les liste,`,
        `indique où les ajouter chez votre hébergeur, et vérifie en direct`,
        `s'ils sont bien en place :`,
        ``,
        link,
        ``,
        `Le lien est valable ${DELEGATE_LINK_DAYS} jours. Il ne donne accès à rien`,
        `d'autre qu'à cette configuration.`,
        ``,
        `Une question ? Répondez simplement à cet email.`,
        ``,
        `— Naywa Studio`,
      ].join("\n"),
    })
  } catch (err) {
    // L'email n'est pas parti : on ne laisse pas croire le contraire, et on
    // efface le jeton — un jeton posé sans que personne ne l'ait reçu n'a
    // aucune raison d'exister.
    console.error("[mailing/delegate] envoi impossible:", (err as Error).message)
    await admin.from("organizations").update({
      mailing_delegate_token: null, mailing_delegate_sent_at: null,
    }).eq("id", org.id)
    return NextResponse.json(
      { error: "send_failed", message: "L'email n'a pas pu être envoyé. Réessayez." },
      { status: 502 },
    )
  }

  return NextResponse.json({ ok: true, email, sent_at: new Date().toISOString() })
}
