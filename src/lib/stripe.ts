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

/** N'accepte comme origine de retour qu'un hôte de preview Vercel (ou le dev
 *  local) : on ne suit jamais un header arbitraire (host-header injection). */
function isTrustedPreviewOrigin(origin: string): boolean {
  try {
    const u = new URL(origin)
    if (u.hostname === "localhost" || u.hostname === "127.0.0.1") return true
    return u.protocol === "https:" && u.hostname.endsWith(".vercel.app")
  } catch {
    return false
  }
}

/**
 * URL de base pour les retours Stripe (success / cancel / portail).
 *
 * En PROD : toujours l'URL canonique — jamais un header fourni par le client
 * (anti host-header injection / open redirect).
 *
 * Hors prod : on renvoie l'utilisateur sur l'hôte EXACT d'où vient sa requête.
 * Une preview Vercel a plusieurs hôtes (URL par déploiement + alias de branche)
 * et les cookies de session Supabase sont liés à l'hôte : retomber sur un autre
 * hôte = plus de cookie = bounce vers /login après le paiement.
 * `NEXT_PUBLIC_APP_URL` (= la prod) reste le dernier recours.
 */
export function getAppUrl(req?: Request): string {
  if (process.env.VERCEL_ENV === "production") {
    return process.env.NEXT_PUBLIC_APP_URL ?? "https://naywastudio.com"
  }
  const origin = req?.headers.get("origin")
  if (origin && isTrustedPreviewOrigin(origin)) return origin

  const host = process.env.VERCEL_BRANCH_URL ?? process.env.VERCEL_URL
  if (host) return `https://${host}`
  return process.env.NEXT_PUBLIC_APP_URL ?? "https://naywastudio.com"
}

/**
 * Résout le Stripe Customer d'une org pour le MODE COURANT (test|live).
 *
 * Un customer Stripe appartient à UN SEUL mode, alors que la base est partagée
 * entre la prod (live) et les previews (test) : un `cus_` live est introuvable
 * via l'API test (« No such customer ») — le checkout tombait alors en 502.
 * On valide donc l'id stocké dans le mode courant et on en recrée un sinon.
 *
 * Ce filet sert aussi en PROD : si un customer est supprimé au dashboard,
 * l'org n'est plus coincée sur un 502 définitif, on repart sur un customer neuf.
 *
 * Renvoie `created: true` quand un nouveau customer a été créé — c'est à
 * l'appelant de le persister sur `organizations.stripe_customer_id`.
 */
export async function ensureStripeCustomer(params: {
  storedId: string | null | undefined
  organizationId: string
  name: string
  email?: string
}): Promise<{ customerId: string; created: boolean }> {
  const stripe = getStripe()
  const { storedId, organizationId, name, email } = params

  if (storedId) {
    try {
      const existing = await stripe.customers.retrieve(storedId)
      if (!existing.deleted) return { customerId: storedId, created: false }
    } catch (err) {
      // On ne repart sur un customer neuf QUE si Stripe dit explicitement que
      // la ressource n'existe pas (mode mismatch, customer supprimé). Une
      // panne réseau / un 500 / un rate-limit ne doit JAMAIS aboutir à créer
      // un doublon : on écraserait stripe_customer_id et on orphelinerait
      // l'abonnement d'un client qui paie. Dans ce cas on relaie l'erreur —
      // l'appelant rend un 502 « réessayez », ce qui est récupérable, alors
      // qu'un lien de facturation cassé ne l'est pas.
      const e = err as { code?: string; statusCode?: number }
      if (e?.code !== "resource_missing" && e?.statusCode !== 404) throw err
    }
  }

  const customer = await stripe.customers.create({
    email,
    name,
    metadata: { organization_id: organizationId },
  })
  return { customerId: customer.id, created: true }
}

// ── Plan catalogue ────────────────────────────────────────────────────
//
// Le catalogue commercial (barème des sièges, add-on Pricing, CV inclus) vit
// dans `lib/pricing-plan.ts` : il est PUR, sans dépendance au SDK Stripe, donc
// importable par les composants client (/tarifs, configurateur, jauges). Ce
// fichier-ci importe le SDK et ne doit jamais atterrir dans le bundle
// navigateur — d'où le sens de la dépendance : stripe.ts → pricing-plan.ts,
// jamais l'inverse.
//
// Ré-exporté ici pour que les appelants serveur n'aient qu'un seul import.

export {
  LOOKUP_SEAT,
  LOOKUP_PRICING_ADDON,
  SEAT_TIERS,
  PRICING_ADDON_EUR,
  MAX_SELF_SERVE_SEATS,
  CV_PER_SEAT,
  priceForSeats,
  monthlyTotalEur,
  cvIncludedForSeats,
  isSelfServeSeats,
  stripeSeatTiers,
  planLabel,
  formatEur,
} from "@/lib/pricing-plan"

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

