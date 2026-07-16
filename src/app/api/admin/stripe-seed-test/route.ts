import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/admin"
import {
  getStripe,
  isStripeTestMode,
  lookupKey,
  PLAN_PRICES_EUR,
  type PlanTier,
  type PlanSeats,
} from "@/lib/stripe"

export const runtime = "nodejs"
export const maxDuration = 60

/**
 * POST /api/admin/stripe-seed-test   (admin Naywa, TEST mode uniquement)
 *
 * Recrée le catalogue Stripe (2 produits × 4 prix mensuels, lookup_keys
 * sourcing_1..4 / sourcing_pro_1..4) dans le compte de TEST, pour pouvoir
 * tester tout le cycle d'abonnement sur les previews sans paiement réel.
 *
 * - Idempotent : un prix dont le lookup_key existe déjà est laissé tel quel.
 * - Refuse de tourner si on n'est PAS en mode test (garde-fou : jamais créer
 *   de doublons dans le catalogue LIVE). Le mode test s'active en posant
 *   STRIPE_SECRET_KEY_TEST sur l'environnement Preview (cf. lib/stripe.ts).
 * - Les montants viennent de PLAN_PRICES_EUR (HT, tax_behavior exclusive).
 *
 * Usage : une fois STRIPE_SECRET_KEY_TEST posée + preview redéployée, un admin
 * appelle cette route une seule fois. Réponse = récap créé/existant.
 */

const PRODUCT_NAME: Record<PlanTier, string> = {
  sourcing: "Package Sourcing",
  sourcing_pro: "Package Sourcing Pro",
}
const SEATS: PlanSeats[] = [1, 2, 3, 4]

export async function POST() {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.response

  if (!isStripeTestMode()) {
    return NextResponse.json(
      {
        error: "not_test_mode",
        message:
          "Cette route ne tourne qu'en mode TEST (STRIPE_SECRET_KEY_TEST posée sur un env non-production). Refus de créer dans le catalogue LIVE.",
      },
      { status: 400 },
    )
  }

  const stripe = getStripe()
  const created: string[] = []
  const skipped: string[] = []

  for (const tier of ["sourcing", "sourcing_pro"] as PlanTier[]) {
    let productId: string | null = null

    for (const seats of SEATS) {
      const key = lookupKey(tier, seats)

      // Idempotence : si un prix actif porte déjà ce lookup_key, on saute.
      const existing = await stripe.prices.list({ lookup_keys: [key], active: true, limit: 1 })
      if (existing.data[0]) {
        skipped.push(key)
        continue
      }

      // Crée le produit du tier à la première nécessité seulement.
      if (!productId) {
        const product = await stripe.products.create({
          name: PRODUCT_NAME[tier],
          metadata: { tier },
        })
        productId = product.id
      }

      await stripe.prices.create({
        product: productId,
        currency: "eur",
        unit_amount: Math.round(PLAN_PRICES_EUR[tier][seats] * 100),
        recurring: { interval: "month" },
        tax_behavior: "exclusive",
        lookup_key: key,
        transfer_lookup_key: true,
        metadata: { tier, seats: String(seats) },
      })
      created.push(key)
    }
  }

  return NextResponse.json({
    ok: true,
    mode: "test",
    created,
    skipped,
    hint: created.length === 0
      ? "Tout était déjà en place."
      : `${created.length} prix créés en mode test. Le checkout/portail des previews les utilisera automatiquement.`,
  })
}
