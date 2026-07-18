/**
 * POST /api/stripe/checkout
 *
 * Owner-only. Crée une Stripe Checkout Session pour souscrire à un plan
 * PAYANT et retourne son URL hostée.
 *
 * Body : { seats: number (1..MAX_SELF_SERVE_SEATS), withPricing?: boolean }
 *
 * L'abonnement porte jusqu'à deux lignes : le socle « sièges » (quantité =
 * seats, barème dégressif appliqué par Stripe) et, en option, l'add-on Suite
 * Pricing à prix plat. Plus de `tier` : il n'y a qu'un seul plan.
 *
 * Important :
 *   - **Pas de `trial_period_days`** : on garde l'essai 15 jours côté
 *     base (table `organizations.trial_ends_at` via
 *     /api/cabinet/activate-trial). Stripe ne sert qu'à la souscription
 *     payante "vraie" — Stripe Checkout affiche donc le montant dû
 *     aujourd'hui, sans wording « essai gratuit » trompeur.
 *   - Si l'owner souscrit AVANT la fin de son essai app-side, son trial
 *     est "consommé" : on le passe en `paid` directement (le webhook
 *     reset `trial_ends_at` à null après création de la sub).
 *
 * Le webhook (/api/stripe/webhook) gère la mise à jour DB après la
 * création de la subscription.
 */

import { NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { getAdminSupabase } from "@/lib/admin-supabase"
import {
  getStripe,
  getAppUrl,
  ensureStripeCustomer,
  getPriceIdByLookupKey,
  LOOKUP_SEAT,
  LOOKUP_PRICING_ADDON,
  MAX_SELF_SERVE_SEATS,
} from "@/lib/stripe"

export const runtime = "nodejs"

interface CheckoutBody {
  /** Nombre de sièges — quantité libre, plus un palier. */
  seats?: number
  /** Suite Pricing Syntec en option (ligne d'abonnement distincte). */
  withPricing?: boolean
}

export async function POST(req: Request) {
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 })
  }

  const body = (await req.json().catch(() => ({}))) as CheckoutBody
  const seats = Number(body.seats)
  const withPricing = body.withPricing === true

  // Le plafond self-service est une règle COMMERCIALE, pas seulement une UI :
  // au-delà on veut une conversation (négociation, facturation). Le
  // configurateur bascule déjà sur la prise de RDV, mais rien n'empêcherait
  // de poster 50 sièges à la main — d'où la validation ici aussi.
  if (!Number.isInteger(seats) || seats < 1 || seats > MAX_SELF_SERVE_SEATS) {
    return NextResponse.json(
      {
        error: "seats_out_of_range",
        message: `Au-delà de ${MAX_SELF_SERVE_SEATS} personnes, contactez-nous pour un devis.`,
      },
      { status: 400 },
    )
  }

  // RLS-scoped read : confirms the caller's org and role.
  const { data: profile, error: profileErr } = await sb
    .from("profiles")
    .select("organization_id, role, first_name")
    .eq("user_id", user.id)
    .single()
  if (profileErr || !profile?.organization_id) {
    return NextResponse.json({ error: "Profil introuvable" }, { status: 404 })
  }
  if (profile.role !== "owner") {
    return NextResponse.json(
      { error: "Seul l'owner peut souscrire" },
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
    return NextResponse.json({ error: "Structure introuvable" }, { status: 404 })
  }

  // Tout le flux Stripe sous try/catch : avant, un throw (clé invalide,
  // moyen de paiement non activé, prix introuvable) remontait en 500 SANS
  // corps → indiagnosticable côté client. On log + renvoie un JSON propre.
  try {
  const stripe = getStripe()

  // Réutilise le Stripe Customer de l'org, ou en crée un. `ensureStripeCustomer`
  // valide que l'id stocké existe bien dans le MODE COURANT : un customer créé
  // en live est inconnu de l'API test (previews) et inversement, ce qui faisait
  // planter le checkout. Email pris sur l'auth ; metadata porte l'org_id pour
  // que le webhook puisse recoller.
  const { customerId, created } = await ensureStripeCustomer({
    storedId: org.stripe_customer_id,
    organizationId: org.id,
    name: org.name,
    email: user.email ?? undefined,
  })
  if (created) {
    const { error: updateErr } = await admin
      .from("organizations")
      .update({ stripe_customer_id: customerId })
      .eq("id", org.id)
    if (updateErr) {
      console.error("[stripe/checkout] persist customer_id", updateErr)
      // Non fatal — the webhook will reconcile via metadata.
    }
  }

  // Deux lignes distinctes : le socle « sièges » — quantité = nb de sièges,
  // c'est Stripe qui applique le barème dégressif — et, si l'option est prise,
  // l'add-on Suite Pricing à prix plat (quantité 1). Les garder séparées est ce
  // qui permet au client d'ajouter/retirer l'option au portail sans changer de
  // plan, et au webhook de dériver `subscription_has_pricing` de sa présence.
  const seatPriceId = await getPriceIdByLookupKey(LOOKUP_SEAT)
  const addonPriceId = withPricing
    ? await getPriceIdByLookupKey(LOOKUP_PRICING_ADDON)
    : null

  const appUrl = getAppUrl(req)
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [
      { price: seatPriceId, quantity: seats },
      ...(addonPriceId ? [{ price: addonPriceId, quantity: 1 }] : []),
    ],
    // Pas de payment_method_types hardcodé : Stripe utilise les moyens de
    // paiement ACTIVÉS au dashboard (dynamic payment methods). L'ancien
    // hardcode ["card", "sepa_debit"] faisait un 500 quand SEPA n'était pas
    // activé sur le compte — activer/désactiver un moyen ne demande plus
    // aucun redeploy.
    locale: "fr",
    allow_promotion_codes: true,
    // Adresse de facturation obligatoire pour qu'une facture B2B française
    // soit valide (mention obligatoire art. 242 nonies A CGI).
    billing_address_collection: "required",
    // Collecte du numéro de TVA intracom / SIRET du client → imprimé
    // automatiquement par Stripe sur toutes les factures futures.
    tax_id_collection: { enabled: true },
    // Mémorise nom + adresse + tax id sur le Stripe Customer pour qu'ils
    // soient réutilisés aux prélèvements suivants sans redemander.
    customer_update: {
      address: "auto",
      name: "auto",
   },
    subscription_data: {
      // Pas de trial_period_days : la souscription est purement payante,
      // le trial est géré séparément côté DB (trial_ends_at).
      metadata: {
        organization_id: org.id,
        seats: String(seats),
        with_pricing: String(withPricing),
      },
    },
    success_url: `${appUrl}/organisation?checkout=success`,
    cancel_url: `${appUrl}/organisation?checkout=cancel`,
    client_reference_id: org.id,
    metadata: {
      organization_id: org.id,
      seats: String(seats),
      with_pricing: String(withPricing),
    },
  })

  return NextResponse.json({ url: session.url })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur Stripe inconnue"
    console.error("[stripe/checkout] failed:", message)
    return NextResponse.json(
      { error: "checkout_failed", message: "Le paiement est momentanément indisponible. Réessayez ou contactez le support." },
      { status: 502 },
    )
  }
}
