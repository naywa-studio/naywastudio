/**
 * POST /api/stripe/portal
 *
 * Owner-only. Creates a Stripe Billing Portal session and returns its
 * hosted URL. The portal lets the customer manage payment methods,
 * download invoices and cancel — but NOT change plans (we handle that
 * via /api/stripe/subscription/update, since per-plan switching needs
 * our seat allocation logic).
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
      { error: "Seul l'owner peut gérer la facturation" },
      { status: 403 },
    )
  }

  const admin = getAdminSupabase()
  const { data: org } = await admin
    .from("organizations")
    .select("stripe_customer_id")
    .eq("id", profile.organization_id)
    .single()

  if (!org?.stripe_customer_id) {
    return NextResponse.json(
      { error: "Aucun abonnement Stripe associé à ce cabinet" },
      { status: 409 },
    )
  }

  const stripe = getStripe()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://naywastudio.com"
  const session = await stripe.billingPortal.sessions.create({
    customer: org.stripe_customer_id,
    return_url: `${appUrl}/organisation`,
  })

  return NextResponse.json({ url: session.url })
}
