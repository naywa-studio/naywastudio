import { NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { getAdminSupabase } from "@/lib/admin-supabase"
import {
  getStripe,
  getPriceIdByLookupKey,
  LOOKUP_SEAT,
  LOOKUP_PRICING_ADDON,
} from "@/lib/stripe"
import { MAX_SELF_SERVE_SEATS } from "@/lib/pricing-plan"

export const runtime = "nodejs"

/**
 * POST /api/stripe/seats  { seats: number }
 *
 * Change le nombre de sièges d'un abonnement EXISTANT.
 *
 * Pourquoi une route dédiée plutôt qu'un second passage au checkout : un
 * checkout crée un nouvel abonnement. Repasser par là quand on en a déjà un
 * produit deux abonnements en parallèle et deux prélèvements — c'est
 * précisément ce que le garde-fou de /api/stripe/checkout refuse désormais.
 * Ici on modifie la LIGNE « sièges » de l'abonnement en place.
 *
 * Proratisation : `create_prorations`. Stripe calcule au prorata du temps
 * restant sur la période — l'organisation ne repaie pas un mois plein pour
 * ajouter une personne en milieu de mois, et récupère un avoir si elle en
 * retire une.
 *
 * Le barème dégressif n'est PAS recalculé ici : la quantité est envoyée à
 * Stripe, qui applique lui-même les paliers définis sur le prix (cf.
 * `stripeTiersFromSeatTiers` dans lib/pricing-plan). Une seule source de
 * vérité pour le tarif.
 *
 * On n'écrit rien en base : le webhook `customer.subscription.updated` que
 * Stripe déclenche derrière remet `subscription_seats` à jour. Écrire ici en
 * plus créerait deux sources de vérité pouvant diverger.
 */
export async function POST(req: Request) {
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })

  let body: { seats?: unknown }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }) }

  const seats = typeof body.seats === "number" ? body.seats : NaN
  if (!Number.isInteger(seats) || seats < 1 || seats > MAX_SELF_SERVE_SEATS) {
    return NextResponse.json(
      {
        error: "seats_out_of_range",
        message: `Choisissez entre 1 et ${MAX_SELF_SERVE_SEATS} personnes. Au-delà, contactez-nous pour un devis.`,
      },
      { status: 400 },
    )
  }

  const { data: profile } = await sb
    .from("profiles")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .single()
  if (!profile?.organization_id) {
    return NextResponse.json({ error: "no_organization" }, { status: 404 })
  }
  // Modifier le nombre de sièges change le montant prélevé : owner uniquement.
  // Un délégué à la configuration n'a aucun droit sur la facturation.
  if (profile.role !== "owner") {
    return NextResponse.json(
      { error: "owner_only", message: "Seul le propriétaire peut modifier l'abonnement." },
      { status: 403 },
    )
  }

  const admin = getAdminSupabase()
  const { data: org } = await admin
    .from("organizations")
    .select("id, stripe_subscription_id")
    .eq("id", profile.organization_id)
    .single()

  if (!org?.stripe_subscription_id) {
    return NextResponse.json(
      {
        error: "no_subscription",
        message: "Aucun abonnement en cours. Souscrivez d'abord pour choisir un nombre de personnes.",
      },
      { status: 400 },
    )
  }

  // Un siège ne peut pas descendre sous le nombre de personnes qui en
  // occupent déjà un : sinon on facture moins que ce qui est utilisé, et
  // l'UI afficherait un budget négatif. À l'owner de libérer des sièges
  // d'abord — geste explicite, qui coupe l'accès de quelqu'un.
  const { count: allocated } = await admin
    .from("profiles")
    .select("user_id", { count: "exact", head: true })
    .eq("organization_id", org.id)
    .eq("has_sourcing_seat", true)
  if (seats < (allocated ?? 0)) {
    return NextResponse.json(
      {
        error: "seats_below_allocated",
        message: `${allocated} personne(s) occupent déjà un siège. Libérez-en avant de descendre à ${seats}.`,
      },
      { status: 409 },
    )
  }

  try {
    const stripe = getStripe()
    const sub = await stripe.subscriptions.retrieve(org.stripe_subscription_id)

    const seatItem = sub.items.data.find((i) => i.price?.lookup_key === LOOKUP_SEAT)

    if (seatItem) {
      // Cas courant : abonnement déjà sur le modèle « quantité de sièges ».
      //
      // Idempotent : redemander la quantité en place n'est pas une erreur
      // (double clic, retry réseau) et ne doit pas générer de proratisation
      // parasite.
      if (seatItem.quantity === seats) {
        // Idempotent côté Stripe — MAIS la base peut être désynchronisée
        // (subscription_seats NULL, ex. abo dont le webhook n'a jamais tourné).
        // On la réaligne quand même sur la valeur confirmée par Stripe, sinon
        // l'UI continue d'afficher le défaut (1) alors que Stripe est à `seats`.
        await admin.from("organizations").update({ subscription_seats: seats }).eq("id", org.id)
        return NextResponse.json({ ok: true, seats, unchanged: true })
      }
      await stripe.subscriptionItems.update(seatItem.id, {
        quantity: seats,
        proration_behavior: "create_prorations",
      })
      // Écriture immédiate de la valeur DÉJÀ confirmée par Stripe : l'UI reflète
      // le changement au refresh sans attendre le webhook (latence + 0 delivery
      // en preview). Le webhook posera la même valeur → aucune divergence.
      await admin.from("organizations").update({ subscription_seats: seats }).eq("id", org.id)
      return NextResponse.json({ ok: true, seats })
    }

    // ── Abonnement sur une ANCIENNE formule ────────────────────────────
    // Avant le modèle actuel, le nombre de sièges était encodé dans le nom du
    // prix (`sourcing_2`, `sourcing_pro_3`…) au lieu d'être une quantité.
    // Refuser net laisserait ces clients incapables d'ajouter une personne
    // sans résilier — exactement la friction qu'on veut supprimer. On bascule
    // donc la ligne vers le prix « siège » à la quantité voulue ; Stripe
    // proratise l'écart.
    const legacyItem = sub.items.data[0]
    if (!legacyItem) {
      return NextResponse.json(
        { error: "empty_subscription", message: "Abonnement sans ligne de facturation." },
        { status: 409 },
      )
    }

    const legacyLookup = legacyItem.price?.lookup_key ?? ""
    // Les anciennes formules « pro » incluaient la Suite Pricing dans le prix.
    // En basculant vers le socle « siège » seul, on la perdrait silencieusement
    // — donc on la rétablit comme ligne d'option, sauf si elle est déjà là.
    const hadBundledPricing = legacyLookup.startsWith("sourcing_pro_")
    const addonAlreadyThere = sub.items.data.some(
      (i) => i.price?.lookup_key === LOOKUP_PRICING_ADDON,
    )

    const seatPriceId = await getPriceIdByLookupKey(LOOKUP_SEAT)
    await stripe.subscriptionItems.update(legacyItem.id, {
      price: seatPriceId,
      quantity: seats,
      proration_behavior: "create_prorations",
    })

    const keepsPricing = hadBundledPricing || addonAlreadyThere
    if (hadBundledPricing && !addonAlreadyThere) {
      const addonPriceId = await getPriceIdByLookupKey(LOOKUP_PRICING_ADDON)
      await stripe.subscriptionItems.create({
        subscription: sub.id,
        price: addonPriceId,
        quantity: 1,
        proration_behavior: "create_prorations",
      })
    }

    // Idem : on reflète tout de suite l'état confirmé par Stripe (sièges, et le
    // maintien de la Suite Pricing pour les anciennes formules « pro »). Le
    // webhook réécrira les mêmes valeurs.
    await admin
      .from("organizations")
      .update({ subscription_seats: seats, subscription_has_pricing: keepsPricing })
      .eq("id", org.id)
    return NextResponse.json({ ok: true, seats, migratedFrom: legacyLookup })
  } catch (err) {
    console.error("[stripe/seats]", err)
    return NextResponse.json(
      { error: "stripe_error", message: "La modification a échoué. Réessayez ou contactez-nous." },
      { status: 502 },
    )
  }
}
