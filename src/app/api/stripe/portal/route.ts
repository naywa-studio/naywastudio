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
import { getStripe, getAppUrl, ensureStripeCustomer } from "@/lib/stripe"

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
    .select("id, name, stripe_customer_id")
    .eq("id", profile.organization_id)
    .single()

  if (!org?.stripe_customer_id) {
    return NextResponse.json(
      { error: "Aucun abonnement Stripe associé à cette organisation" },
      { status: 409 },
    )
  }

  // Même filet que le checkout : l'id stocké peut appartenir à l'autre mode
  // (base partagée prod/preview) ou avoir été supprimé au dashboard. Sans ça,
  // billingPortal.sessions.create jetait et la route rendait un 500 sans corps.
  try {
    const { customerId, created } = await ensureStripeCustomer({
      storedId: org.stripe_customer_id,
      organizationId: org.id,
      name: org.name,
      email: user.email ?? undefined,
    })
    if (created) {
      await admin
        .from("organizations")
        .update({ stripe_customer_id: customerId })
        .eq("id", org.id)
    }

    const session = await getStripe().billingPortal.sessions.create({
      customer: customerId,
      return_url: `${getAppUrl()}/organisation`,
    })
    return NextResponse.json({ url: session.url })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur Stripe inconnue"
    console.error("[stripe/portal] failed:", message)
    return NextResponse.json(
      {
        error: "portal_failed",
        message: "Le portail de facturation est momentanément indisponible. Réessayez ou contactez le support.",
      },
      { status: 502 },
    )
  }
}
