/**
 * POST /api/stripe/checkout
 *
 * Owner-only. Crée une Stripe Checkout Session pour souscrire à un plan
 * et retourne son URL hostée.
 *
 * Body : { tier: 'sourcing' | 'sourcing_pro', seats: 1|2|3|4 }
 *
 * Si l'org a un trial app-side encore actif (trial_ends_at > now), on
 * propage les jours restants à Stripe via `trial_period_days` pour que
 * l'user ne paie pas avant l'expiry de son essai. Sinon, prélèvement
 * immédiat normal.
 *
 * L'activation du trial passe désormais par /api/cabinet/activate-trial,
 * pas par cette route — d'où la suppression du withTrial flag.
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
    .select("id, name, stripe_customer_id, trial_ends_at")
    .eq("id", profile.organization_id)
    .single()
  if (orgErr || !org) {
    return NextResponse.json({ error: "Cabinet introuvable" }, { status: 404 })
  }

  // Si trial app-side encore actif, on propage les jours restants à
  // Stripe (trial_period_days) — l'user conserve son essai même en
  // souscrivant maintenant, et le prélèvement n'arrive qu'à expiry.
  let trialPeriodDays: number | undefined
  if (org.trial_ends_at) {
    const endMs = new Date(org.trial_ends_at).getTime()
    const remaining = Math.ceil((endMs - Date.now()) / (24 * 60 * 60 * 1000))
    if (remaining > 0) {
      trialPeriodDays = Math.min(remaining, 30)  // safety cap
    }
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
    billing_address_collection: "auto",
    subscription_data: {
      ...(trialPeriodDays ? { trial_period_days: trialPeriodDays } : {}),
      metadata: {
        organization_id: org.id,
        tier,
        seats: String(seats),
        trial_period_days: trialPeriodDays ? String(trialPeriodDays) : "0",
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
