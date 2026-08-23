/**
 * Le domaine d'envoi d'une organisation — déclaration et état.
 *
 *   GET   → où en est mon domaine, et que reste-t-il à publier ?
 *   POST  → je déclare mon domaine (idempotent)
 *
 * ── Ce que cette route ne fait PAS ────────────────────────────────────────
 *
 * Elle ne débloque rien. Déclarer un domaine le met en attente de DNS ; c'est
 * `POST /api/mailing/domain/verify` qui constate la publication des clés, et
 * lui seul peut faire passer l'état à `active`. La séparation est volontaire :
 * un état `active` posé sans preuve DNS ferait partir des emails non
 * authentifiés sous la marque du client, c'est-à-dire droit en spam.
 *
 * ── Qui a le droit ────────────────────────────────────────────────────────
 *
 * L'option acquise (`hasMailingAccess`) ET la capacité branding
 * (`canBranding`). Le domaine d'envoi EST une identité de marque : il
 * s'affiche sur chaque message reçu par un candidat, au même titre que le nom
 * et le logo. Il suit donc la même délégation, plutôt qu'une règle à lui —
 * deux mécanismes de droits finissent toujours par diverger.
 */

import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { getAdminSupabase } from "@/lib/admin-supabase"
import { getCapabilities } from "@/lib/capabilities"
import { hasMailingAccess } from "@/lib/subscription"
import { mailingVisible } from "@/lib/mailing/rollout"
import { activeProvider, reputationGroupFor } from "@/lib/mailing/send"
import { DEFAULT_SUBDOMAIN, sendingDomainFor } from "@/lib/mailing/provider"
import { checkRootDomain, cleanSubdomain, explainRejection, isForbiddenSendingDomain } from "@/lib/mailing/domain-input"
import { explainSesError, ensureReputationGroup } from "@/lib/mailing/ses"
import { switchOrgInboxAddresses } from "@/lib/mailing/inbox-address"

export const runtime = "nodejs"
export const maxDuration = 30

/** Auth + entitlement + capacité, en une fois. */
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
  if (!caps.canBranding) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "forbidden", message: "Seul le responsable de l'identité de l'organisation peut configurer le domaine d'envoi." },
        { status: 403 },
      ),
    }
  }
  if (!mailingVisible(profile) || !hasMailingAccess(org, { isAdmin: caps.isAdminNaywa })) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "mailing_not_included", message: "L'option Mailing n'est pas incluse dans votre formule." },
        { status: 403 },
      ),
    }
  }

  return { ok: true as const, admin, org, isAdmin: caps.isAdminNaywa }
}

/** Vue publique de l'état du domaine. Ne renvoie jamais le jeton de délégation. */
function publicState(org: Record<string, unknown>) {
  return {
    domain: org.mailing_domain ?? null,
    subdomain: org.mailing_subdomain ?? DEFAULT_SUBDOMAIN,
    sending_domain: org.mailing_sending_domain ?? null,
    status: org.mailing_status ?? null,
    verified_at: org.mailing_verified_at ?? null,
    records: org.mailing_dns_records ?? [],
  }
}

export async function GET() {
  const g = await gate()
  if (!g.ok) return g.response
  return NextResponse.json({ ok: true, ...publicState(g.org) })
}

export async function POST(req: NextRequest) {
  const g = await gate()
  if (!g.ok) return g.response
  const { admin, org } = g

  const body = await req.json().catch(() => null) as {
    domain?: unknown; subdomain?: unknown; confirm_replace?: unknown
  } | null

  const check = checkRootDomain(
    typeof body?.domain === "string" ? body.domain : "",
    { isAdmin: g.isAdmin },
  )
  if (!check.ok) {
    return NextResponse.json(
      { error: "invalid_domain", message: explainRejection(check.reason!) },
      { status: 400 },
    )
  }
  const subdomain = cleanSubdomain(typeof body?.subdomain === "string" ? body.subdomain : null)
    ?? DEFAULT_SUBDOMAIN
  const sendingDomain = sendingDomainFor(check.value, subdomain)

  // Le contrôle qui compte : ce depuis quoi on enverra RÉELLEMENT. Il porte
  // sur le domaine composé, pas sur la racine saisie — une racine anodine et
  // un sous-domaine anodin peuvent composer un domaine qui ne l'est pas.
  if (isForbiddenSendingDomain(sendingDomain)) {
    return NextResponse.json(
      { error: "invalid_domain", message: explainRejection("reserved") },
      { status: 400 },
    )
  }

  /* ── Remplacer un domaine DÉJÀ actif se confirme ───────────────────────
   *
   * Les candidats en cours de discussion écrivent à l'ancien domaine. Il
   * continuera de recevoir tant que ses enregistrements MX pointent vers
   * nous — mais c'est la zone DNS du client, hors de notre contrôle. Un
   * changement non voulu couperait donc des conversations en cours sans
   * qu'on puisse le rattraper. On demande à l'appelant de le dire. */
  if (
    org.mailing_status === "active" &&
    org.mailing_sending_domain &&
    org.mailing_sending_domain !== sendingDomain &&
    body?.confirm_replace !== true
  ) {
    return NextResponse.json({
      error: "replace_requires_confirmation",
      message:
        `Votre domaine d'envoi actuel (${org.mailing_sending_domain}) est actif. ` +
        "Le remplacer peut interrompre les échanges en cours avec les candidats déjà contactés.",
      current: org.mailing_sending_domain,
    }, { status: 409 })
  }

  // Un domaine d'envoi identifie une organisation à la réception : deux ne
  // peuvent pas le revendiquer. L'index unique le garantit, mais le dire ici
  // donne un message compréhensible plutôt qu'une erreur de base.
  const { data: taken } = await admin
    .from("organizations")
    .select("id")
    .eq("mailing_sending_domain", sendingDomain)
    .neq("id", org.id)
    .limit(1)
    .maybeSingle()
  if (taken) {
    return NextResponse.json({
      error: "domain_taken",
      message: "Ce domaine d'envoi est déjà utilisé par une autre organisation. Contactez-nous si c'est le vôtre.",
    }, { status: 409 })
  }

  /* ── Le jeu de configuration de cette organisation ─────────────────────
   *
   * À créer AVANT le premier envoi : SES rejette tout message qui en nomme un
   * inexistant. Best-effort — si la politique IAM ne l'autorise pas, on perd
   * la mesure de réputation, pas le service (l'envoi retombe alors sans jeu
   * de configuration, en le journalisant).
   *
   * Placé ici parce que c'est le seul endroit qui connaît à la fois
   * l'organisation et le moment où elle se met en route. */
  await ensureReputationGroup(reputationGroupFor(org.id))

  // Déclaration chez le fournisseur. Idempotente par contrat : un domaine
  // déjà déclaré est renvoyé tel quel, jamais recréé — recréer ferait tourner
  // les clés DKIM et casserait un domaine en production.
  let declared
  try {
    declared = await activeProvider().createSendingDomain(sendingDomain)
  } catch (err) {
    console.error("[mailing/domain] déclaration impossible:", err)
    return NextResponse.json(
      { error: "provider_failed", message: explainSesError(err) },
      { status: 502 },
    )
  }

  const { error } = await admin.from("organizations").update({
    mailing_domain: check.value,
    mailing_subdomain: subdomain,
    mailing_sending_domain: sendingDomain,
    mailing_provider_domain_id: declared.id,
    mailing_dns_records: declared.records,
    // Jamais 'active' ici : seule la vérification peut l'accorder.
    mailing_status: declared.status === "active" ? "active" : (declared.status || "awaiting_dns"),
    mailing_verified_at: declared.status === "active" ? new Date().toISOString() : null,
  }).eq("id", org.id)

  if (error) {
    console.error("[mailing/domain] écriture impossible:", error.message)
    return NextResponse.json({ error: "store_failed", detail: "internal_error" }, { status: 500 })
  }

  /* ── Un domaine peut naître ACTIF ──────────────────────────────────────
   *
   * Si le fournisseur connaît déjà ce domaine et l'a vérifié, la déclaration
   * ressort `active` du premier coup — et la vérification n'aura alors plus
   * rien à annoncer. Ne basculer les adresses que dans la vérification les
   * laissait donc en arrière dans ce cas précis, sans le moindre signe.
   * Constaté en vrai sur l'organisation de test. */
  const switched = declared.status === "active"
    ? await switchOrgInboxAddresses(
        admin,
        { ...org, mailing_sending_domain: sendingDomain, mailing_status: "active" },
        { isAdmin: g.isAdmin },
      )
    : 0

  return NextResponse.json({
    ok: true,
    domain: check.value,
    subdomain,
    sending_domain: sendingDomain,
    status: declared.status,
    records: declared.records,
    addresses_switched: switched,
  })
}
