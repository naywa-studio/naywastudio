import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/admin"
import {
  getStripe,
  isStripeTestMode,
  LOOKUP_SEAT,
  LOOKUP_PRICING_ADDON,
  PRICING_ADDON_EUR,
  stripeSeatTiers,
} from "@/lib/stripe"

export const runtime = "nodejs"
export const maxDuration = 60

/**
 * POST /api/admin/stripe-seed-test   (admin Naywa, TEST mode uniquement)
 *
 * Crée le catalogue Stripe dans le compte de TEST, pour pouvoir tester tout le
 * cycle d'abonnement sur les previews sans paiement réel.
 *
 * Catalogue (modèle juillet 2026 — cf. lib/pricing-plan.ts) :
 *   - `sourcing_seat`  : prix à paliers DÉGRESSIFS (`graduated`), quantité =
 *                        nombre de sièges. Un seul prix couvre 1..N sièges.
 *   - `pricing_addon`  : Suite Pricing Syntec, prix PLAT, quantité 1.
 *
 * Remplace les 8 prix figés sourcing_1..4 / sourcing_pro_1..4 : le nombre de
 * sièges est devenu une quantité, plus un palier encodé dans un nom de prix.
 *
 * - Idempotent : un prix dont le lookup_key existe déjà est laissé tel quel.
 * - Refuse de tourner si on n'est PAS en mode test (garde-fou : jamais créer
 *   de doublons dans le catalogue LIVE — celui-ci se gère au dashboard).
 * - Les montants viennent de `lib/pricing-plan.ts` (HT, tax_behavior exclusive),
 *   même source que l'affichage : le barème facturé ne peut pas diverger de
 *   celui montré au client.
 */

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

  // ── 1. Socle « sièges », barème dégressif ───────────────────────────
  const seatExists = await stripe.prices.list({
    lookup_keys: [LOOKUP_SEAT],
    active: true,
    limit: 1,
  })
  if (seatExists.data[0]) {
    skipped.push(LOOKUP_SEAT)
  } else {
    const seatProduct = await stripe.products.create({
      name: "Naywa — Sourcing",
      description: "Accès au workspace Naywa, par personne. Tarif dégressif.",
    })
    await stripe.prices.create({
      product: seatProduct.id,
      currency: "eur",
      recurring: { interval: "month" },
      tax_behavior: "exclusive",
      // `tiered` + `graduated` : chaque palier ne facture que les sièges qui
      // tombent DEDANS (1er à 38,99 · 2e à 31 · suivants à 25). Pas de
      // `unit_amount` au niveau du prix — Stripe le refuse en mode tiered.
      billing_scheme: "tiered",
      tiers_mode: "graduated",
      tiers: stripeSeatTiers(),
      lookup_key: LOOKUP_SEAT,
      transfer_lookup_key: true,
    })
    created.push(LOOKUP_SEAT)
  }

  // ── 2. Add-on Suite Pricing Syntec, prix plat ───────────────────────
  const addonExists = await stripe.prices.list({
    lookup_keys: [LOOKUP_PRICING_ADDON],
    active: true,
    limit: 1,
  })
  if (addonExists.data[0]) {
    skipped.push(LOOKUP_PRICING_ADDON)
  } else {
    const addonProduct = await stripe.products.create({
      name: "Naywa — Suite Pricing Syntec",
      description:
        "Moteur de calcul Syntec : TJM, marges, simulation. Option, quel que soit le nombre de personnes.",
    })
    await stripe.prices.create({
      product: addonProduct.id,
      currency: "eur",
      unit_amount: Math.round(PRICING_ADDON_EUR * 100),
      recurring: { interval: "month" },
      tax_behavior: "exclusive",
      lookup_key: LOOKUP_PRICING_ADDON,
      transfer_lookup_key: true,
    })
    created.push(LOOKUP_PRICING_ADDON)
  }

  return NextResponse.json({
    ok: true,
    mode: "test",
    created,
    skipped,
    hint:
      created.length === 0
        ? "Tout était déjà en place."
        : `${created.length} prix créés en mode test. Le checkout/portail des previews les utilisera automatiquement.`,
  })
}
