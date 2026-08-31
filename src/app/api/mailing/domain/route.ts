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
import { DEFAULT_FROM_LOCAL, DEFAULT_SUBDOMAIN, sendingDomainFor } from "@/lib/mailing/provider"
import { checkRootDomain, cleanLocalPart, cleanSubdomain, explainRejection, isForbiddenSendingDomain } from "@/lib/mailing/domain-input"
import { explainSesError, ensureReputationGroup, ensureEventDestination } from "@/lib/mailing/ses"
import { switchOrgInboxAddresses } from "@/lib/mailing/inbox-address"
import { deleteZone, explainRoute53Error } from "@/lib/mailing/dns-zone"
import { noticeFor, type NoticeOrg, type NoticeLang } from "@/lib/mailing/legal-notice"

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
    .select("user_id, organization_id, role, is_admin, can_manage_branding, can_manage_pricing, can_manage_team, has_sourcing_seat, preferred_language")
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
  if (!mailingVisible(profile, org) || !hasMailingAccess(org, { isAdmin: caps.isAdminNaywa })) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "mailing_not_included", message: "L'option Mailing n'est pas incluse dans votre formule." },
        { status: 403 },
      ),
    }
  }

  return { ok: true as const, admin, org, isAdmin: caps.isAdminNaywa, lang: langOf(profile) }
}

/** Vue publique de l'état du domaine. Ne renvoie jamais le jeton de délégation. */
/** `lang` : l'aperçu doit montrer la mention TELLE QU'ELLE PARTIRA — donc dans
 *  la langue du sourceur, pas systématiquement en français. */
/** Langue du caller, réduite au motif sûr utilisé partout dans le produit. */
function langOf(p: { preferred_language?: string | null } | null | undefined): NoticeLang {
  return p?.preferred_language === "en" ? "en" : "fr"
}

function publicState(org: Record<string, unknown>, lang: NoticeLang = "fr") {
  return {
    domain: org.mailing_domain ?? null,
    subdomain: org.mailing_subdomain ?? DEFAULT_SUBDOMAIN,
    from_local: org.mailing_from_local ?? DEFAULT_FROM_LOCAL,
    notice_enabled: org.mailing_notice_enabled !== false,
    notice_text: org.mailing_notice_text ?? null,
    /* Le texte réellement joint aujourd'hui, calculé côté serveur : l'écran
     * doit montrer ce qui PART, pas reconstruire une approximation. */
    notice_effective: noticeFor(org as NoticeOrg, lang),
    sending_domain: org.mailing_sending_domain ?? null,
    status: org.mailing_status ?? null,
    verified_at: org.mailing_verified_at ?? null,
    records: org.mailing_dns_records ?? [],
    /* Le parcours emprunté décide de ce que l'écran demande au client : les
     * quatre enregistrements du fournisseur, ou les quatre serveurs de noms
     * de la zone qu'on héberge pour lui. Lui montrer les deux le ferait
     * publier deux fois — et la seconde publication annulerait la première. */
    path: org.mailing_path ?? null,
    nameservers: org.mailing_ns_records ?? [],
  }
}

/**
 * DELETE — le client reprend la main sur son domaine.
 *
 * ── Pourquoi ça doit exister ─────────────────────────────────────────────
 *
 * Sans chemin de retrait, une zone Route 53 survit à son client : elle
 * continue d'être facturée 0,50 $ par mois, indéfiniment, sans que rien ne le
 * signale. Une fonctionnalité qu'on ne peut pas quitter proprement est une
 * fonctionnalité dont le coût ne fait que monter.
 *
 * ── Ce qui n'est PAS détruit ─────────────────────────────────────────────
 *
 * Les échanges. Les adresses de réception repassent sur le domaine Naywa,
 * mais les anciennes sont **archivées en alias** (migration 087) : un candidat
 * qui répond à un message parti la semaine dernière est toujours rattaché.
 * Quitter l'option ne doit jamais faire disparaître des réponses.
 *
 * L'identité SES n'est pas supprimée non plus : elle ne coûte rien, et la
 * détruire ferait tourner les clés DKIM pour rien si le client revient.
 */
export async function DELETE() {
  const g = await gate()
  if (!g.ok) return g.response
  const { admin, org } = g

  const sendingDomain = org.mailing_sending_domain
  if (!sendingDomain) return NextResponse.json({ ok: true, already: true })

  // La zone d'abord : si elle échoue, on n'efface RIEN en base. Effacer
  // l'identifiant de zone avant de l'avoir supprimée la rendrait
  // introuvable — donc éternellement facturée, sans trace de son existence.
  let zoneRemoved = false
  if (org.mailing_path === "ns_delegation") {
    try {
      zoneRemoved = await deleteZone(sendingDomain)
    } catch (err) {
      console.error("[mailing/domain] suppression de zone impossible:", err)
      return NextResponse.json(
        { error: "zone_delete_failed", message: explainRoute53Error(err) },
        { status: 502 },
      )
    }
  }

  const { error } = await admin.from("organizations").update({
    mailing_domain: null,
    mailing_subdomain: null,
    mailing_from_local: null,
    mailing_sending_domain: null,
    mailing_path: null,
    mailing_dns_zone_id: null,
    mailing_ns_records: null,
    mailing_dns_records: null,
    mailing_status: null,
    mailing_verified_at: null,
    mailing_delegate_email: null,
    mailing_delegate_token: null,
    mailing_delegate_sent_at: null,
  }).eq("id", org.id)

  if (error) {
    console.error("[mailing/domain] réinitialisation impossible:", error.message)
    return NextResponse.json({ error: "store_failed", detail: "internal_error" }, { status: 500 })
  }

  // Les adresses repassent sur le domaine Naywa, les anciennes deviennent des
  // alias : les réponses en cours continuent d'arriver.
  const switched = await switchOrgInboxAddresses(
    admin,
    { ...org, mailing_status: null, mailing_sending_domain: null },
    { isAdmin: g.isAdmin },
  )

  return NextResponse.json({ ok: true, zone_removed: zoneRemoved, addresses_switched: switched })
}

export async function GET() {
  const g = await gate()
  if (!g.ok) return g.response
  return NextResponse.json({ ok: true, ...publicState(g.org, g.lang) })
}

/**
 * PATCH — l'adresse d'expédition, et elle seule.
 *
 * ── Pourquoi une route séparée du POST ───────────────────────────────────
 *
 * Parce que ce réglage n'a rien à voir avec le DNS. La partie locale d'une
 * adresse ne s'authentifie pas : seul le domaine le fait. La changer ne
 * demande donc aucune republication, aucune revérification, et surtout aucune
 * interruption — c'est le seul réglage de ce chantier qui se modifie à chaud,
 * domaine actif compris.
 *
 * Le faire passer par le POST forcerait une redéclaration chez le fournisseur
 * pour un champ cosmétique, et rouvrirait la question de remplacement de
 * domaine (le 409) là où il n'y a rien à remplacer.
 */
export async function PATCH(req: NextRequest) {
  const g = await gate()
  if (!g.ok) return g.response
  const { admin, org } = g

  const body = await req.json().catch(() => null) as {
    from_local?: unknown; notice_enabled?: unknown; notice_text?: unknown
  } | null

  /* ── La mention d'information, réglée séparément ───────────────────────
   *
   * Un PATCH qui ne porte QUE la mention est légitime : c'est un réglage
   * distinct de l'adresse d'expédition, et exiger les deux ensemble
   * obligerait l'écran à renvoyer une valeur qu'il ne modifie pas — donc à
   * l'écraser un jour par accident. */
  if (body && ("notice_enabled" in body || "notice_text" in body)) {
    const patch: { mailing_notice_enabled?: boolean; mailing_notice_text?: string | null } = {}
    if (typeof body.notice_enabled === "boolean") patch.mailing_notice_enabled = body.notice_enabled
    if ("notice_text" in body) {
      const txt = typeof body.notice_text === "string" ? body.notice_text.trim() : ""
      // Chaîne vide → NULL, donc retour au texte par défaut. Stocker "" ferait
      // disparaître la mention en silence, ce qui n'est pas la même décision
      // que décocher — et le cabinet n'aurait aucun moyen de s'en apercevoir.
      patch.mailing_notice_text = txt || null
    }
    const { error: noticeErr } = await admin.from("organizations").update(patch).eq("id", org.id)
    if (noticeErr) {
      console.error("[mailing/domain] mention non enregistrée:", noticeErr.message)
      return NextResponse.json({ error: "store_failed", detail: "internal_error" }, { status: 500 })
    }
    if (!("from_local" in body)) {
      const { data: fresh } = await admin
        .from("organizations").select("*").eq("id", org.id).single()
      return NextResponse.json({ ok: true, ...publicState(fresh ?? org, g.lang) })
    }
  }

  const fromLocal = cleanLocalPart(typeof body?.from_local === "string" ? body.from_local : null)
  if (!fromLocal) {
    return NextResponse.json({
      error: "invalid_from_local",
      message: "Utilisez des lettres, chiffres, points ou tirets — par exemple « recrutement » ou « jean.dupont ».",
    }, { status: 400 })
  }

  const { error } = await admin
    .from("organizations")
    .update({ mailing_from_local: fromLocal })
    .eq("id", org.id)
  if (error) {
    console.error("[mailing/domain] adresse d'expédition non enregistrée:", error.message)
    return NextResponse.json({ error: "store_failed", detail: "internal_error" }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    from_local: fromLocal,
    from_address: org.mailing_sending_domain ? `${fromLocal}@${org.mailing_sending_domain}` : null,
  })
}

export async function POST(req: NextRequest) {
  const g = await gate()
  if (!g.ok) return g.response
  const { admin, org } = g

  const body = await req.json().catch(() => null) as {
    domain?: unknown; subdomain?: unknown; from_local?: unknown; confirm_replace?: unknown
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

  /* La partie locale de l'adresse d'expédition. Facultative comme le
   * sous-domaine : une saisie inutilisable retombe sur le défaut plutôt que de
   * bloquer une mise en route pour un champ de confort. Ce qui est déjà
   * enregistré prime sur le défaut — repasser par la déclaration ne doit pas
   * effacer un choix fait plus tôt. */
  const fromLocal = cleanLocalPart(typeof body?.from_local === "string" ? body.from_local : null)
    ?? org.mailing_from_local
    ?? DEFAULT_FROM_LOCAL

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
  const group = reputationGroupFor(org.id)
  await ensureReputationGroup(group)
  // ⚠️ Sans CET appel, le jeu de configuration existe mais ne publie rien :
  // un message rebondi reste « envoyé » pour toujours. C'était le cas jusqu'ici
  // — la mesure était créée, jamais branchée.
  await ensureEventDestination(group)

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
    mailing_from_local: fromLocal,
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
    from_local: fromLocal,
    sending_domain: sendingDomain,
    status: declared.status,
    records: declared.records,
    addresses_switched: switched,
  })
}
