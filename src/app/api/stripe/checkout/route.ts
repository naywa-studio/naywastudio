/**
 * POST /api/stripe/checkout
 *
 * Owner-only. Crée une Stripe Checkout Session pour souscrire à un plan
 * PAYANT et retourne son URL hostée.
 *
 * Body : { tier: 'sourcing' | 'sourcing_pro', seats: 1|2|3|4 }
 *
 * Important :
 *   - **Pas de `trial_period_days`** : on garde l'essai 15 jours côté
 *     base (table `organizations.trial_ends_at` via
 *     /api/cabinet/activate-trial). Stripe ne sert qu'à la souscription
 *     payante "vraie" — Stripe Checkout affiche donc le montant dû
 *     aujourd'hui, sans wording « essai gratuit » trompeur.
 *   - Si l'owner souscrit AVANT la fin de son essai app-side, son trial
 *     est "consommé" : on le passe en `paid` directement (le webhook
 *     reset `trial_ends_at` à null après création de la sub).
 *
 * Le webhook (/api/stripe/webhook) gère la mise à jour DB après la
 * création de la subscription.
 */

import { NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { getAdminSupabase } from "@/lib/admin-supabase"
import {
  getStripe,
  getPriceIdByLookupKey,
  lookupKey,
  type PlanTier,
  type PlanSeats,
} from "@/lib/stripe"

export const runtime = "nodejs"

interface CheckoutBody {
  tier?: PlanTier
  seats?: PlanSeats
}

export async function POST(req: Request) {
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 })
  }

  const body = (await req.json().catch(() => ({}))) as CheckoutBody
  const tier = body.tier
  const seats = body.seats

  if (tier !== "sourcing" && tier !== "sourcing_pro") {
    return NextResponse.json({ error: "Tier invalide" }, { status: 400 })
  }
  if (![1, 2, 3, 4].includes(seats as number)) {
    return NextResponse.json({ error: "Nombre de sièges invalide" }, { status: 400 })
  }

  // RLS-scoped read : confirms the caller's org and role.
  const { data: profile, error: profileErr } = await sb
    .from("profiles")
    .select("organization_id, role, first_name")
    .eq("user_id", user.id)
    .single()
  if (profileErr || !profile?.organization_id) {
    return NextResponse.json({ error: "Profil introuvable" }, { status: 404 })
  }
  if (profile.role !== "owner") {
    return NextResponse.json(
      { error: "Seul l'owner peut souscrire" },
      { status: 403 },
    )
  }

  const admin = getAdminSupabase()
  const { data: org, error: orgErr } = await admin
    .from("organizations")
    .select("id, name, stripe_customer_id")
    .eq("id", profile.organization_id)
    .single()
  if (orgErr || !org) {
    return NextResponse.json({ error: "Structure introuvable" }, { status: 404 })
  }

  const stripe = getStripe()

  // Reuse or create the Stripe Customer. Email is taken from auth ;
  // metadata holds the org_id so the webhook can match it back.
  let customerId = org.stripe_customer_id
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      name: org.name,
      metadata: { organization_id: org.id },
    })
    customerId = customer.id
    const { error: updateErr } = await admin
      .from("organizations")
      .update({ stripe_customer_id: customerId })
      .eq("id", org.id)
    if (updateErr) {
      console.error("[stripe/checkout] persist customer_id", updateErr)
      // Non fatal — the webhook will reconcile via metadata.
    }
  }

  const priceId = await getPriceIdByLookupKey(
    lookupKey(tier as PlanTier, seats as PlanSeats),
  )

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://naywastudio.com"
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    payment_method_types: ["card", "sepa_debit"],
    locale: "fr",
    allow_promotion_codes: true,
    // Adresse de facturation obligatoire pour qu'une facture B2B française
    // soit valide (mention obligatoire art. 242 nonies A CGI).
    billing_address_collection: "required",
    // Collecte du numéro de TVA intracom / SIRET du client → imprimé
    // automatiquement par Stripe sur toutes les factures futures.
    tax_id_collection: { enabled: true },
    // Mémorise nom + adresse + tax id sur le Stripe Customer pour qu'ils
    // soient réutilisés aux prélèvements suivants sans redemander.
    customer_update: {
      address: "auto",
      name: "auto",
   },
    subscription_data: {
      // Pas de trial_period_days : la souscription est purement payante,
      // le trial est géré séparément côté DB (trial_ends_at).
      metadata: {
        organization_id: org.id,
        tier,
        seats: String(seats),
      },
    },
    success_url: `${appUrl}/organisation?checkout=success`,
    cancel_url: `${appUrl}/organisation?checkout=cancel`,
    client_reference_id: org.id,
    metadata: {
      organization_id: org.id,
      tier,
      seats: String(seats),
    },
  })

  return NextResponse.json({ url: session.url })
}
