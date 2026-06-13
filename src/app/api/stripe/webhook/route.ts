/**
 * POST /api/stripe/webhook
 *
 * Receives subscription lifecycle events from Stripe. Signature is verified
 * against STRIPE_WEBHOOK_SECRET ; any mismatch returns 400 immediately.
 *
 * Handled events (matches what we subscribed in the dashboard) :
 *   - checkout.session.completed
 *   - customer.subscription.created / updated / deleted
 *   - customer.subscription.trial_will_end
 *   - invoice.payment_succeeded
 *   - invoice.payment_failed
 *
 * The handler is idempotent : it always upserts the subscription state
 * from the event payload, never relies on the previous DB row except
 * to find the org via metadata.organization_id.
 */

import { NextResponse } from "next/server"
import type Stripe from "stripe"
import { getStripe } from "@/lib/stripe"
import { getAdminSupabase } from "@/lib/admin-supabase"

export const runtime = "nodejs"

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature")
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!sig || !secret) {
    return NextResponse.json(
      { error: "Missing signature or webhook secret" },
      { status: 400 },
    )
  }

  const stripe = getStripe()
  const rawBody = await req.text()

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, secret)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    console.error("[stripe/webhook] signature mismatch:", message)
    return NextResponse.json({ error: "Bad signature" }, { status: 400 })
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await onCheckoutCompleted(event.data.object)
        break
      case "customer.subscription.created":
      case "customer.subscription.updated":
        await onSubscriptionUpsert(event.data.object)
        break
      case "customer.subscription.deleted":
        await onSubscriptionDeleted(event.data.object)
        break
      case "customer.subscription.trial_will_end":
        // No-op for now — the TrialBanner uses current_period_end.
        // Later : trigger a Resend "trial ending in 3 days" email.
        break
      case "invoice.payment_succeeded":
        await onInvoicePaid(event.data.object)
        break
      case "invoice.payment_failed":
        await onInvoiceFailed(event.data.object)
        break
      default:
        // We didn't subscribe to other events ; Stripe shouldn't send any.
        break
    }
  } catch (err) {
    console.error(`[stripe/webhook] handler error for ${event.type}:`, err)
    // Return 500 so Stripe retries — the handlers are idempotent.
    return NextResponse.json({ error: "Handler failed" }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}

// ── Event handlers ────────────────────────────────────────────────────

async function onCheckoutCompleted(session: Stripe.Checkout.Session) {
  const orgId =
    session.metadata?.organization_id ?? session.client_reference_id
  if (!orgId) {
    console.warn("[stripe/webhook] checkout.completed without org id")
    return
  }
  const admin = getAdminSupabase()
  const customerId =
    typeof session.customer === "string"
      ? session.customer
      : session.customer?.id ?? null

  if (customerId) {
    await admin
      .from("organizations")
      .update({ stripe_customer_id: customerId })
      .eq("id", orgId)
  }
}

async function onSubscriptionUpsert(sub: Stripe.Subscription) {
  const admin = getAdminSupabase()

  const orgId = await resolveOrgId(sub)
  if (!orgId) {
    console.warn("[stripe/webhook] subscription without org id:", sub.id)
    return
  }

  const item = sub.items.data[0]
  const lookup = item?.price?.lookup_key ?? null
  const seats = parseSeatsFromLookup(lookup)
  const hasPricing = lookup?.startsWith("sourcing_pro_") ?? false

  const customerId =
    typeof sub.customer === "string" ? sub.customer : sub.customer.id

  // Period end : prefer item-level (per the recent Stripe API change),
  // fall back to subscription-level for older payload shapes.
  const periodEndSec =
    (item as unknown as { current_period_end?: number })?.current_period_end ??
    (sub as unknown as { current_period_end?: number }).current_period_end ??
    null

  await admin
    .from("organizations")
    .update({
      stripe_customer_id: customerId,
      stripe_subscription_id: sub.id,
      subscription_status: sub.status,
      subscription_price_lookup: lookup,
      subscription_seats: seats,
      subscription_has_pricing: hasPricing,
      current_period_end: periodEndSec
        ? new Date(periodEndSec * 1000).toISOString()
        : null,
    })
    .eq("id", orgId)
}

async function onSubscriptionDeleted(sub: Stripe.Subscription) {
  const admin = getAdminSupabase()
  const orgId = await resolveOrgId(sub)
  if (!orgId) return

  await admin
    .from("organizations")
    .update({
      subscription_status: "canceled",
      stripe_subscription_id: null,
      current_period_end: null,
    })
    .eq("id", orgId)
}

async function onInvoicePaid(invoice: Stripe.Invoice) {
  // For the moment we don't need to do anything beyond what the
  // subscription update event already covers — Stripe fires both for a
  // typical renewal. Hook this up later for a Resend "facture payée"
  // notification if the user asks for it.
  void invoice
}

async function onInvoiceFailed(invoice: Stripe.Invoice) {
  // Same — covered by subscription.updated (status flips to past_due).
  // Later : Resend alert to the owner with a "Mettre à jour ma carte"
  // link to the portal.
  void invoice
}

// ── helpers ───────────────────────────────────────────────────────────

async function resolveOrgId(sub: Stripe.Subscription): Promise<string | null> {
  const fromMeta = sub.metadata?.organization_id
  if (fromMeta) return fromMeta

  // Fallback : look up the org by stripe_customer_id.
  const customerId =
    typeof sub.customer === "string" ? sub.customer : sub.customer.id
  const admin = getAdminSupabase()
  const { data } = await admin
    .from("organizations")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .single()
  return data?.id ?? null
}

function parseSeatsFromLookup(lookup: string | null): number | null {
  if (!lookup) return null
  const m = lookup.match(/_(\d+)$/)
  return m ? Number(m[1]) : null
}
