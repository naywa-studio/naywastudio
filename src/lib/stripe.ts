/**
 * Stripe — server-only client and small helpers.
 *
 * - Single Stripe instance pinned to one API version (no implicit upgrades).
 * - Price IDs are looked up by `lookup_key` so the code stays portable
 *   between TEST and LIVE modes — no IDs hard-coded.
 * - Plan model (catalogue mirror of what's in the Stripe dashboard) :
 *     sourcing       1..4 sièges (38.99 .. 119.99 €)
 *     sourcing_pro   1..4 sièges (46.99 .. 151.99 €) → includes Suite Pricing Syntec
 *
 * The lookup_key is also persisted on `organizations.subscription_price_lookup`
 * after a successful Checkout, so we can render the dashboard banner
 * without round-tripping to Stripe on every page load.
 */

import Stripe from "stripe"

let cached: Stripe | null = null

/**
 * Vrai hors production : on privilégie le mode TEST Stripe si des clés de test
 * sont fournies. Permet de tester tout le cycle (checkout, portail, webhook,
 * résiliation) sur les previews Vercel SANS paiement réel. La prod
 * (`VERCEL_ENV === "production"`) reste toujours en LIVE.
 */
export function isStripeTestMode(): boolean {
  return process.env.VERCEL_ENV !== "production" && !!process.env.STRIPE_SECRET_KEY_TEST
}

export function getStripe(): Stripe {
  if (cached) return cached
  // Preview / dev → clé TEST si dispo ; sinon (et prod) → clé LIVE.
  const key = isStripeTestMode()
    ? process.env.STRIPE_SECRET_KEY_TEST!
    : process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error("STRIPE_SECRET_KEY is missing")
  cached = new Stripe(key, {
    apiVersion: "2026-05-27.dahlia",
    typescript: true,
    appInfo: { name: "naywa-studio", url: "https://naywastudio.com" },
  })
  return cached
}

/**
 * Secret de signature du webhook, aligné sur le mode (test en preview, live en
 * prod). Le webhook de test a son propre secret (`STRIPE_WEBHOOK_SECRET_TEST`).
 */
export function getStripeWebhookSecret(): string | undefined {
  return isStripeTestMode()
    ? process.env.STRIPE_WEBHOOK_SECRET_TEST
    : process.env.STRIPE_WEBHOOK_SECRET
}

// ── Plan catalogue ────────────────────────────────────────────────────

export type PlanTier = "sourcing" | "sourcing_pro"
export type PlanSeats = 1 | 2 | 3 | 4

/** Lookup keys used in the Stripe dashboard. */
export function lookupKey(tier: PlanTier, seats: PlanSeats): string {
  return tier === "sourcing_pro"
    ? `sourcing_pro_${seats}`
    : `sourcing_${seats}`
}

/** Parse a lookup_key back into the structured plan. Returns null if
 *  the key shape doesn't match — defensive against stale DB rows or
 *  manually-injected values. */
export function parseLookupKey(
  key: string | null | undefined,
): { tier: PlanTier; seats: PlanSeats } | null {
  if (!key) return null
  const m = key.match(/^(sourcing(?:_pro)?)_(\d+)$/)
  if (!m) return null
  const tier = m[1] === "sourcing_pro" ? "sourcing_pro" : "sourcing"
  const seats = Number(m[2])
  if (![1, 2, 3, 4].includes(seats)) return null
  return { tier: tier as PlanTier, seats: seats as PlanSeats }
}

/** Resolve a Stripe Price ID from a lookup_key. Cached for the lifetime
 *  of the lambda. Throws if no price matches — that's a deployment
 *  config bug, not a recoverable error. */
const priceIdCache = new Map<string, string>()

export async function getPriceIdByLookupKey(key: string): Promise<string> {
  if (priceIdCache.has(key)) return priceIdCache.get(key)!
  const stripe = getStripe()
  const list = await stripe.prices.list({
    lookup_keys: [key],
    active: true,
    limit: 1,
  })
  const price = list.data[0]
  if (!price) {
    throw new Error(`Stripe price not found for lookup_key="${key}"`)
  }
  priceIdCache.set(key, price.id)
  return price.id
}

// ── Plan pricing display ──────────────────────────────────────────────
//
// Mirror of the prices entered in the dashboard. Used for client-side
// rendering of the upgrade picker without hitting Stripe each time.
// Source of truth remains Stripe — this table only needs to stay in
// sync for display ; the actual billing always uses the Stripe price.

export const PLAN_PRICES_EUR: Record<PlanTier, Record<PlanSeats, number>> = {
  sourcing: {
    1: 38.99,
    2: 69.99,
    3: 94.99,
    4: 119.99,
  },
  sourcing_pro: {
    1: 46.99,
    2: 85.99,
    3: 118.99,
    4: 151.99,
  },
}

export function priceForPlan(tier: PlanTier, seats: PlanSeats): number {
  return PLAN_PRICES_EUR[tier][seats]
}
