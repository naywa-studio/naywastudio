/**
 * POST /api/stripe/mailing-addon   { enable: boolean }
 *
 * Owner-only. Active ou retire l'option Mailing — écrire aux candidats depuis
 * le domaine de l'organisation — sur l'abonnement en cours.
 *
 * ── Ce que cette route débloque, et ce qu'elle ne débloque pas ───────────
 *
 * Elle pose l'ENTITLEMENT (`subscription_has_mailing`). L'envoi effectif
 * réclame en plus un domaine VÉRIFIÉ : `canSendFromOrgDomain` exige les deux.
 * Confondre les deux ferait partir des emails depuis un domaine sans clés
 * DKIM publiées — droit en spam, sous la marque du client, sans erreur
 * visible nulle part.
 *
 * ── Ce qui se passe quand on retire l'option ─────────────────────────────
 *
 * L'envoi candidat retombe sur le domaine de Naywa, et les adresses de
 * réception suivront à leur prochain usage. **Les échanges en cours ne sont
 * pas perdus** : les anciennes adresses restent en alias (migration 087) et
 * continuent d'être rattachées. Une résiliation ne doit pas faire disparaître
 * les réponses de candidats déjà contactés.
 *
 * La mécanique Stripe vit dans `lib/stripe-addon.ts`, partagée avec la Suite
 * Pricing.
 */

import { NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { toggleSubscriptionAddon } from "@/lib/stripe-addon"
import { LOOKUP_MAILING_ADDON } from "@/lib/stripe"

export const runtime = "nodejs"

export async function POST(req: Request) {
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as { enable?: unknown }
  if (typeof body.enable !== "boolean") {
    return NextResponse.json({ error: "enable_required" }, { status: 400 })
  }

  const res = await toggleSubscriptionAddon({
    sb,
    userId: user.id,
    lookupKey: LOOKUP_MAILING_ADDON,
    column: "subscription_has_mailing",
    enable: body.enable,
    label: "l'option Mailing",
  })

  if (!res.ok) {
    return NextResponse.json({ error: res.error, message: res.message }, { status: res.status })
  }
  return NextResponse.json({ ok: true, enabled: res.enabled, unchanged: res.unchanged })
}
