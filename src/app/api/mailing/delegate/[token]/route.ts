/**
 * GET  /api/mailing/delegate/:token   — lire la configuration à publier
 * POST /api/mailing/delegate/:token   — demander une vérification
 *
 * Point d'entrée PUBLIC, destiné au contact technique du cabinet — un tiers
 * que Naywa n'authentifie pas, désigné par le client.
 *
 * ── Ce que le jeton ouvre, et rien de plus ───────────────────────────────
 *
 * Le domaine d'envoi, les enregistrements à publier, leur état, et le nom du
 * cabinet pour que le destinataire sache de quoi il s'agit. Aucun candidat,
 * aucune mission, aucune adresse de sourceur, aucun accès au workspace.
 *
 * Les enregistrements eux-mêmes ne sont pas des secrets : ils ont vocation à
 * être publiés dans un DNS public. Ce que le jeton protège, c'est surtout le
 * fait de savoir QUEL cabinet met en route QUEL domaine.
 *
 * ── Ce qu'il ne permet pas ───────────────────────────────────────────────
 *
 * Changer le domaine. La vérification, elle, est sans danger : elle ne peut
 * qu'accorder un état que le fournisseur accorde déjà de son côté.
 *
 * ── Expiration ───────────────────────────────────────────────────────────
 *
 * Passé DELEGATE_LINK_DAYS, le lien cesse de fonctionner. Renvoyer la demande
 * depuis la console fabrique un nouveau jeton et invalide l'ancien.
 */

import { NextResponse } from "next/server"
import { getAdminSupabase } from "@/lib/admin-supabase"
import { checkRecords, detectDnsHost } from "@/lib/mailing/dns-check"
import { verifyAndPersist, delegateLinkExpired } from "@/lib/mailing/verify-domain"
import { explainSesError } from "@/lib/mailing/ses"
import type { Organization } from "@/lib/database.types"

export const runtime = "nodejs"
export const maxDuration = 30

/** Un UUID, et rien d'autre : on ne veut pas d'une requête sur une chaîne libre. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function orgForToken(token: string): Promise<Organization | null> {
  if (!UUID_RE.test(token)) return null
  const { data } = await getAdminSupabase()
    .from("organizations").select("*").eq("mailing_delegate_token", token).maybeSingle()
  if (!data) return null
  if (delegateLinkExpired(data.mailing_delegate_sent_at)) return null
  return data as Organization
}

/**
 * Vue publique — délibérément étroite.
 *
 * Tout champ ajouté ici part chez un tiers non authentifié. La liste est donc
 * une liste d'INCLUSION explicite, jamais un `...org` : un spread laisserait
 * passer la prochaine colonne sensible ajoutée à `organizations`, sans que
 * personne ne le remarque.
 */
function publicView(org: Organization, extra: Record<string, unknown> = {}) {
  return {
    ok: true,
    org_name: org.brand_name || org.name,
    sending_domain: org.mailing_sending_domain,
    status: org.mailing_status,
    records: org.mailing_dns_records ?? [],
    ...extra,
  }
}

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  const org = await orgForToken(token)
  // Jeton inconnu et jeton expiré donnent la MÊME réponse : distinguer les
  // deux permettrait de tester des jetons au hasard et d'apprendre lesquels
  // ont existé.
  if (!org) return NextResponse.json({ error: "invalid_link" }, { status: 404 })

  const records = (org.mailing_dns_records ?? []) as Parameters<typeof checkRecords>[0]
  const [checks, host] = org.mailing_status === "active"
    ? [[], null]
    : await Promise.all([
        checkRecords(records),
        org.mailing_domain ? detectDnsHost(org.mailing_domain) : Promise.resolve(null),
      ])

  return NextResponse.json(publicView(org, { checks, host }))
}

export async function POST(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  const org = await orgForToken(token)
  if (!org) return NextResponse.json({ error: "invalid_link" }, { status: 404 })

  try {
    // MÊME fonction que le chemin authentifié — y compris la bascule des
    // adresses de réception. Sans ça, un domaine vérifié par le prestataire
    // serait actif à l'envoi et muet à la réception : les candidats
    // répondraient dans le vide, et personne ne verrait d'erreur.
    const out = await verifyAndPersist(getAdminSupabase(), org)
    return NextResponse.json(publicView(
      { ...org, mailing_status: out.status, mailing_dns_records: out.records } as Organization,
      { checks: out.checks, host: out.host, became_active: out.becameActive },
    ))
  } catch (err) {
    console.error("[mailing/delegate] vérification impossible:", err)
    return NextResponse.json(
      { error: "verify_failed", message: explainSesError(err) },
      { status: 502 },
    )
  }
}
