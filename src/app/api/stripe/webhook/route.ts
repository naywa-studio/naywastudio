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
import {
  sendSubscriptionWelcome,
  sendPaymentFailed,
  sendTrialEndingSoon,
} from "@/lib/stripe-emails"

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
        await onTrialWillEnd(event.data.object)
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

  // Read previous state to detect a fresh activation (welcome mail) and
  // to know whether seats_total needs to be raised.
  const { data: prev } = await admin
    .from("organizations")
    .select("subscription_status, seats_total")
    .eq("id", orgId)
    .single()

  // seats_total ne descend jamais — un downgrade ne doit pas casser un
  // membre déjà invité. Stripe gère la facturation, l'app gère la
  // visibilité ; on prend le max.
  const nextSeatsTotal = seats != null
    ? Math.max(prev?.seats_total ?? 0, seats)
    : prev?.seats_total ?? 0

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
      seats_total: nextSeatsTotal,
    })
    .eq("id", orgId)

  // Welcome mail only on the first transition into active/trialing.
  // We compare against the persisted state, not against sub.status —
  // Stripe replays events freely and we don't want to spam.
  const wasActive =
    prev?.subscription_status === "active" ||
    prev?.subscription_status === "trialing"
  const isActive = sub.status === "active" || sub.status === "trialing"
  if (!wasActive && isActive) {
    await notifyOwnerWelcome(orgId, lookup, seats, hasPricing)
  }
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
  // Stripe envoie déjà la facture PDF au client (option "Send invoices
  // to customers" activée). Côté app on n'a rien à faire — la mise à
  // jour de current_period_end arrive par subscription.updated.
  void invoice
}

async function onInvoiceFailed(invoice: Stripe.Invoice) {
  // Alerte propriétaire avec lien direct vers /organisation (qui offre
  // le bouton "Gérer mon abonnement" -> portail Stripe). subscription
  // .updated bascule le status à past_due en parallèle.
  const customerId =
    typeof invoice.customer === "string"
      ? invoice.customer
      : invoice.customer?.id ?? null
  if (!customerId) return

  const admin = getAdminSupabase()
  const { data: org } = await admin
    .from("organizations")
    .select("id, owner_user_id")
    .eq("stripe_customer_id", customerId)
    .single()
  if (!org?.owner_user_id) return

  const owner = await getOwnerContact(org.owner_user_id)
  if (!owner?.email) return

  const amountEur = (invoice.amount_due ?? 0) / 100
  await sendPaymentFailed({
    to: owner.email,
    firstName: owner.firstName,
    amountEur,
  })
}

async function onTrialWillEnd(sub: Stripe.Subscription) {
  const orgId = await resolveOrgId(sub)
  if (!orgId) return

  const admin = getAdminSupabase()
  const { data: org } = await admin
    .from("organizations")
    .select("owner_user_id")
    .eq("id", orgId)
    .single()
  if (!org?.owner_user_id) return

  const owner = await getOwnerContact(org.owner_user_id)
  if (!owner?.email) return

  // Stripe envoie ce hook ~3 jours avant la fin d'essai par défaut.
  const trialEnd = sub.trial_end ? sub.trial_end * 1000 : null
  const daysLeft = trialEnd
    ? Math.max(1, Math.ceil((trialEnd - Date.now()) / (24 * 60 * 60 * 1000)))
    : 3

  await sendTrialEndingSoon({
    to: owner.email,
    firstName: owner.firstName,
    daysLeft,
  })
}

async function notifyOwnerWelcome(
  orgId: string,
  lookup: string | null,
  seats: number | null,
  hasPricing: boolean,
): Promise<void> {
  const admin = getAdminSupabase()
  const { data: org } = await admin
    .from("organizations")
    .select("owner_user_id")
    .eq("id", orgId)
    .single()
  if (!org?.owner_user_id) return

  const owner = await getOwnerContact(org.owner_user_id)
  if (!owner?.email) return

  await sendSubscriptionWelcome({
    to: owner.email,
    firstName: owner.firstName,
    planLabel: hasPricing ? "Package Sourcing Pro" : "Package Sourcing",
    seats: seats ?? 1,
  })
  // lookup uniquement loggué pour debug — pas remonté dans le mail.
  if (!lookup) console.warn("[stripe/webhook] welcome without price lookup for org:", orgId)
}

async function getOwnerContact(
  userId: string,
): Promise<{ email: string; firstName: string | null } | null> {
  const admin = getAdminSupabase()
  const { data: profile } = await admin
    .from("profiles")
    .select("first_name")
    .eq("user_id", userId)
    .single()

  const { data: { user } } = await admin.auth.admin.getUserById(userId)
  if (!user?.email) return null
  return { email: user.email, firstName: profile?.first_name ?? null }
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
