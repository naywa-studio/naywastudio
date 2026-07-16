/**
 * POST /api/stripe/pricing-addon
 *
 * Owner-only. Active ou retire la Suite Pricing Syntec sur l'abonnement EN
 * COURS, sans repasser par un checkout.
 *
 * Body : { enable: boolean }
 *
 * Pourquoi cette route existe : l'option n'était réglable qu'au moment de la
 * souscription. Un client qui commençait sans, puis se mettait à faire de la
 * régie, n'avait aucun moyen de l'ajouter — il aurait fallu résilier puis
 * re-souscrire. Inacceptable pour une option qu'on vend justement comme
 * activable à tout moment (cf. CGU §6 et la FAQ tarifs, qui le promettent).
 *
 * Mécanique : l'add-on est une LIGNE d'abonnement distincte (cf.
 * lib/pricing-plan.ts). L'activer = créer cette ligne, la retirer = la
 * supprimer. On ne touche jamais à la ligne « sièges ».
 *
 * Proratisation : `create_prorations` — Stripe calcule au prorata du temps
 * restant sur la période. Activer le 20 d'un mois payé jusqu'au 30 ne facture
 * pas un mois plein, et retirer génère un avoir. C'est ce qui rend l'option
 * réellement « à tout moment » plutôt que « à tout moment, mais tu paies ».
 *
 * La base n'est PAS écrite ici : le webhook `customer.subscription.updated`
 * dérive `subscription_has_pricing` de la présence de la ligne. Une seule
 * source de vérité, et le portail Stripe reste cohérent s'il modifie l'abo.
 */

import { NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { getAdminSupabase } from "@/lib/admin-supabase"
import {
  getStripe,
  getPriceIdByLookupKey,
  LOOKUP_PRICING_ADDON,
} from "@/lib/stripe"

export const runtime = "nodejs"

interface Body {
  enable?: boolean
}

export async function POST(req: Request) {
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 })
  }

  const body = (await req.json().catch(() => ({}))) as Body
  if (typeof body.enable !== "boolean") {
    return NextResponse.json({ error: "enable_required" }, { status: 400 })
  }
  const enable = body.enable

  const { data: profile } = await sb
    .from("profiles")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .single()
  if (!profile?.organization_id) {
    return NextResponse.json({ error: "no_organization" }, { status: 404 })
  }
  // Une option payante engage la facturation de l'organisation : seul l'owner.
  if (profile.role !== "owner") {
    return NextResponse.json(
      { error: "owner_only", message: "Seul le propriétaire peut modifier l'abonnement." },
      { status: 403 },
    )
  }

  const admin = getAdminSupabase()
  const { data: org } = await admin
    .from("organizations")
    .select("id, stripe_subscription_id")
    .eq("id", profile.organization_id)
    .single()

  if (!org?.stripe_subscription_id) {
    return NextResponse.json(
      {
        error: "no_subscription",
        message:
          "Aucun abonnement actif. Souscrivez d'abord — vous pourrez inclure la Suite Pricing directement.",
      },
      { status: 400 },
    )
  }

  try {
    const stripe = getStripe()
    const sub = await stripe.subscriptions.retrieve(org.stripe_subscription_id)

    const addonItem = sub.items.data.find(
      (i) => i.price?.lookup_key === LOOKUP_PRICING_ADDON,
    )

    // Idempotent : réclamer l'état déjà en place n'est pas une erreur (double
    // clic, retry réseau) et ne doit surtout pas créer une 2ᵉ ligne add-on.
    if (enable && addonItem) {
      return NextResponse.json({ ok: true, enabled: true, unchanged: true })
    }
    if (!enable && !addonItem) {
      return NextResponse.json({ ok: true, enabled: false, unchanged: true })
    }

    if (enable) {
      const priceId = await getPriceIdByLookupKey(LOOKUP_PRICING_ADDON)
      await stripe.subscriptionItems.create({
        subscription: sub.id,
        price: priceId,
        quantity: 1,
        proration_behavior: "create_prorations",
      })
    } else {
      await stripe.subscriptionItems.del(addonItem!.id, {
        proration_behavior: "create_prorations",
      })
    }

    // On ne touche pas à la base : le webhook subscription.updated que Stripe
    // vient de déclencher dérive subscription_has_pricing de la présence de la
    // ligne. Écrire ici en plus créerait deux sources de vérité qui peuvent
    // diverger (ex. si le client modifie aussi son abo au portail).
    return NextResponse.json({ ok: true, enabled: enable })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur Stripe inconnue"
    console.error("[stripe/pricing-addon] failed:", message)
    return NextResponse.json(
      {
        error: "addon_update_failed",
        message: "Modification impossible pour le moment. Réessayez ou contactez le support.",
      },
      { status: 502 },
    )
  }
}
