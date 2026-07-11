/**
 * POST /api/stripe/setup-intent
 *
 * Owner-only. Crée une Stripe Checkout Session en mode "setup" — l'user
 * dépose son moyen de paiement (CB / SEPA), aucun plan n'est verrouillé,
 * aucun prix n'est affiché.
 *
 * Utilisé pendant l'activation du trial quand l'owner choisit "Oui je
 * configure mon moyen de paiement maintenant". Le PM est attaché au
 * Stripe Customer ; quand l'owner choisira son plan plus tard via le
 * PlanPicker, la subscription sera créée avec ce PM par défaut.
 */

import { NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { getAdminSupabase } from "@/lib/admin-supabase"
import { getStripe } from "@/lib/stripe"

export const runtime = "nodejs"

export async function POST() {
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 })
  }

  const { data: profile, error: profileErr } = await sb
    .from("profiles")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .single()
  if (profileErr || !profile?.organization_id) {
    return NextResponse.json({ error: "Profil introuvable" }, { status: 404 })
  }
  if (profile.role !== "owner") {
    return NextResponse.json(
      { error: "Seul l'owner peut configurer le moyen de paiement" },
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

  const stripe = getStripe()

  // Réutilise ou crée le Stripe Customer comme dans /checkout.
  let customerId = org.stripe_customer_id
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      name: org.name,
      metadata: { organization_id: org.id },
    })
    customerId = customer.id
    await admin
      .from("organizations")
      .update({ stripe_customer_id: customerId })
      .eq("id", org.id)
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://naywastudio.com"
  const session = await stripe.checkout.sessions.create({
    mode: "setup",
    customer: customerId,
    // Moyens de paiement pilotés par le dashboard Stripe (pas de hardcode —
    // ["card","sepa_debit"] plantait quand SEPA n'était pas activé).
    locale: "fr",
    success_url: `${appUrl}/organisation?setup=success`,
    cancel_url: `${appUrl}/organisation?setup=cancel`,
    metadata: {
      organization_id: org.id,
    },
  })

  return NextResponse.json({ url: session.url })
}
