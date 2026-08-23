/**
 * POST /api/mailing/domain/delegate-zone
 *
 * Bascule l'organisation sur le parcours « Naywa héberge la zone » : on crée
 * la zone du sous-domaine chez Route 53, on y écrit les enregistrements du
 * fournisseur, et on rend au client les quatre serveurs de noms à publier.
 *
 * ── Ce que le client fait, une fois ──────────────────────────────────────
 *
 * Quatre enregistrements NS sur `careers`, chez son hébergeur. Ensuite, plus
 * rien : les clés DKIM, leurs rotations, une correction, un ajout — tout se
 * fait de notre côté sans le solliciter.
 *
 * C'est la différence de fond avec le parcours manuel. Là-bas, chaque
 * changement futur est une nouvelle demande au client, donc une nouvelle
 * occasion de le perdre.
 *
 * ── Ce qu'on ne délègue JAMAIS ───────────────────────────────────────────
 *
 * La zone racine. Elle porte son site et sa messagerie interne : une erreur
 * de notre part le couperait du monde. On ne prend que le sous-domaine, dont
 * nous sommes seul utilisateur.
 *
 * ── Ordre des opérations, et pourquoi ────────────────────────────────────
 *
 * Zone → enregistrements → NS rendus au client. Écrire les enregistrements
 * AVANT que le client ne publie ses NS n'a rien d'inutile : le jour où la
 * délégation prend effet, tout est déjà en place et la vérification passe
 * immédiatement. L'inverse ferait attendre une seconde propagation.
 */

import { NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { getAdminSupabase } from "@/lib/admin-supabase"
import { getCapabilities } from "@/lib/capabilities"
import { hasMailingAccess } from "@/lib/subscription"
import { mailingVisible } from "@/lib/mailing/rollout"
import { activeProvider, reputationGroupFor } from "@/lib/mailing/send"
import { ensureReputationGroup, explainSesError } from "@/lib/mailing/ses"
import { ensureZone, writeRecords, explainRoute53Error } from "@/lib/mailing/dns-zone"

export const runtime = "nodejs"
export const maxDuration = 60

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
  if (!mailingVisible(profile) || !hasMailingAccess(org, { isAdmin: caps.isAdminNaywa })) {
    return NextResponse.json({ error: "mailing_not_included" }, { status: 403 })
  }
  if (!org.mailing_sending_domain) {
    return NextResponse.json(
      { error: "no_domain", message: "Déclarez d'abord votre nom de domaine." },
      { status: 400 },
    )
  }

  const sendingDomain = org.mailing_sending_domain

  try {
    // Le jeu de configuration d'abord : SES rejette tout envoi qui en nomme un
    // inexistant, et on préfère l'avoir posé avant que le domaine ne s'active.
    await ensureReputationGroup(reputationGroupFor(org.id))

    // Idempotent des deux côtés : une identité déjà déclarée est renvoyée
    // telle quelle, une zone existante est réutilisée. Recréer l'une ou
    // l'autre ferait tourner des clés ou des serveurs de noms, et casserait
    // un domaine en production sans erreur visible.
    const declared = await activeProvider().createSendingDomain(sendingDomain)

    /* ── Jamais de zone qu'on ne saurait pas remplir ────────────────────
     *
     * Une zone déléguée devient AUTORITAIRE dès que le client publie ses NS.
     * Vide, elle ne répond plus rien : les clés DKIM disparaissent et le
     * domaine d'envoi tombe — après avoir fonctionné, ce qui est le pire
     * moment pour tomber.
     *
     * Ce garde-fou existe parce que le cas s'est produit : sur un domaine
     * déjà vérifié, le fournisseur renvoyait une liste vide et on créait
     * quand même la zone. Corrigé à la source, mais la vérification reste :
     * c'est la dernière chose entre nous et un domaine client cassé. */
    if (declared.records.length === 0) {
      console.error("[mailing/delegate-zone] aucun enregistrement à écrire pour", sendingDomain)
      return NextResponse.json({
        error: "no_records",
        message:
          "Impossible de préparer la zone : le fournisseur n'a renvoyé aucun enregistrement. " +
          "Contactez le support plutôt que de publier les serveurs de noms.",
      }, { status: 502 })
    }

    const zone = await ensureZone(sendingDomain)
    const written = await writeRecords(zone.id, declared.records)

    const { error } = await admin.from("organizations").update({
      mailing_path: "ns_delegation",
      mailing_dns_zone_id: zone.id,
      mailing_ns_records: zone.nameservers,
      mailing_provider_domain_id: declared.id,
      mailing_dns_records: declared.records,
      // Ce qui reste à faire est côté CLIENT : publier les NS. On ne prétend
      // pas être en vérification tant qu'il ne l'a pas fait.
      mailing_status: declared.status === "active" ? "active" : "awaiting_dns",
    }).eq("id", org.id)

    if (error) {
      console.error("[mailing/delegate-zone] écriture impossible:", error.message)
      return NextResponse.json({ error: "store_failed", detail: "internal_error" }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      path: "ns_delegation",
      sending_domain: sendingDomain,
      nameservers: zone.nameservers,
      records_written: written,
      status: declared.status === "active" ? "active" : "awaiting_dns",
    })
  } catch (err) {
    // Les deux services échouent différemment et pour des raisons différentes :
    // on ne renvoie pas un message de SES quand c'est Route 53 qui refuse, et
    // le premier refus attendu — une politique IAM qui ne couvre pas Route 53 —
    // ne s'expliquerait pas tout seul.
    const isRoute53 = /hostedzone|route ?53/i.test(String(err))
    console.error("[mailing/delegate-zone] échec:", err)
    return NextResponse.json(
      {
        error: "delegation_failed",
        message: isRoute53 ? explainRoute53Error(err) : explainSesError(err),
      },
      { status: 502 },
    )
  }
}
