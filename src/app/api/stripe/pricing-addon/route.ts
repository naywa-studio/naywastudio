/**
 * POST /api/stripe/pricing-addon   { enable: boolean }
 *
 * Owner-only. Active ou retire la Suite Pricing Syntec sur l'abonnement EN
 * COURS, sans repasser par un checkout.
 *
 * Pourquoi cette route existe : l'option n'était réglable qu'au moment de la
 * souscription. Un client qui commençait sans, puis se mettait à faire de la
 * régie, aurait dû résilier puis re-souscrire — inacceptable pour une option
 * vendue comme activable à tout moment (CGU §6 et FAQ tarifs le promettent).
 *
 * Toute la mécanique vit dans `lib/stripe-addon.ts`, partagée avec l'option
 * Mailing : deux copies auraient fini par diverger, et une divergence ici se
 * paie en facturation.
 */

import { NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { toggleSubscriptionAddon } from "@/lib/stripe-addon"
import { LOOKUP_PRICING_ADDON } from "@/lib/stripe"

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
    lookupKey: LOOKUP_PRICING_ADDON,
    column: "subscription_has_pricing",
    enable: body.enable,
    label: "la Suite Pricing",
  })

  if (!res.ok) {
    return NextResponse.json({ error: res.error, message: res.message }, { status: res.status })
  }
  return NextResponse.json({ ok: true, enabled: res.enabled, unchanged: res.unchanged })
}
