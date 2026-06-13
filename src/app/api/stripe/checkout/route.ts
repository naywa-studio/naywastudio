/**
 * POST /api/stripe/checkout
 *
 * Owner-only. Creates a Stripe Checkout Session and returns its hosted URL.
 *
 * Body :
 *   { tier: 'sourcing' | 'sourcing_pro', seats: 1|2|3|4, withTrial?: boolean }
 *
 * If withTrial=true :
 *   - tier is forced to 'sourcing_pro', seats to 2 (the fixed trial plan)
 *   - the subscription is created with trial_period_days = 15
 *   - the customer's email is recorded in trial_consumed_emails to
 *     prevent re-using the trial later from another cabinet
 *   - 409 is returned if that email has already used a trial
 *
 * The webhook (/api/stripe/webhook) does the actual DB mirroring after
 * the subscription is created — this route only kicks the flow off.
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
  withTrial?: boolean
}

/** Le trial est fixe : 2 sièges Pro pendant 15 j. Le user peut souscrire
 *  à plus gros plus tard, mais l'essai démarre ici. */
const TRIAL_TIER: PlanTier = "sourcing_pro"
const TRIAL_SEATS: PlanSeats = 2
const TRIAL_DAYS = 15

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export async function POST(req: Request) {
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 })
  }

  const body = (await req.json().catch(() => ({}))) as CheckoutBody
  const withTrial = body.withTrial === true

  // Si withTrial : on force le plan trial fixe (2 sièges Pro). L'user
  // peut switcher après. Sinon on prend ce que l'UI a envoyé.
  const tier: PlanTier | undefined = withTrial ? TRIAL_TIER : body.tier
  const seats: PlanSeats | undefined = withTrial ? TRIAL_SEATS : body.seats

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
    return NextResponse.json({ error: "Cabinet introuvable" }, { status: 404 })
  }

  // Garde anti double-trial : un même email ne peut pas re-tirer un
  // essai en supprimant son cabinet et en re-souscrivant ailleurs.
  const ownerEmail = user.email ? normalizeEmail(user.email) : null
  if (withTrial && ownerEmail) {
    const { data: consumed } = await admin
      .from("trial_consumed_emails")
      .select("email")
      .eq("email", ownerEmail)
      .maybeSingle()
    if (consumed) {
      return NextResponse.json(
        { error: "Vous avez déjà utilisé votre essai gratuit. Souscrivez directement pour reprendre l'accès." },
        { status: 409 },
      )
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
      ...(withTrial ? { trial_period_days: TRIAL_DAYS } : {}),
      metadata: {
        organization_id: org.id,
        tier,
        seats: String(seats),
        with_trial: withTrial ? "true" : "false",
      },
    },
    success_url: `${appUrl}/organisation?checkout=success`,
    cancel_url: `${appUrl}/organisation?checkout=cancel`,
    client_reference_id: org.id,
    metadata: {
      organization_id: org.id,
      tier,
      seats: String(seats),
      with_trial: withTrial ? "true" : "false",
    },
  })

  // On marque l'email comme trial-consommé immédiatement (avant même
  // que Stripe confirme). Si l'user abandonne le Checkout, c'est tant
  // pis — il avait l'occasion d'utiliser son essai et n'a pas continué.
  // Évite la fuite via "click activate, cancel, click again, repeat".
  if (withTrial && ownerEmail) {
    await admin
      .from("trial_consumed_emails")
      .upsert(
        { email: ownerEmail, organization_id: org.id },
        { onConflict: "email" },
      )
  }

  return NextResponse.json({ url: session.url })
}
