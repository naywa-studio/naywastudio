/**
 * Activer ou retirer une OPTION sur l'abonnement en cours.
 *
 * ── Pourquoi c'est mutualisé ──────────────────────────────────────────────
 *
 * Il y a deux options (Suite Pricing, Mailing) et il y en aura d'autres. La
 * mécanique est identique au mot près : trouver la ligne, la créer ou la
 * supprimer, proratiser, refléter en base. Deux copies de ce fichier
 * finiraient par diverger — et une divergence ici se paie en facturation :
 * une option offerte à qui n'a pas payé, ou facturée à qui l'a retirée.
 *
 * C'est déjà arrivé sur la Suite Pricing, restée gratuite pour tout le monde
 * parce que le contrôle d'entitlement existait sans être appelé.
 *
 * ── Ce que la fonction garantit ───────────────────────────────────────────
 *
 * **Owner uniquement.** Une option payante engage la facturation de
 * l'organisation ; ni un délégué ni un membre ne l'engagent.
 *
 * **Idempotence.** Réclamer l'état déjà en place n'est pas une erreur — double
 * clic, retry réseau — et ne doit surtout pas créer une seconde ligne, donc
 * un second prélèvement.
 *
 * **Proratisation.** `create_prorations` : activer le 20 d'un mois payé
 * jusqu'au 30 ne facture pas un mois plein, et retirer génère un avoir. C'est
 * ce qui rend l'option réellement « activable à tout moment » plutôt que
 * « à tout moment, mais tu paies ».
 *
 * **Écriture directe de la base.** On n'attend PAS le webhook : il a de la
 * latence en production et zéro livraison en preview. La valeur écrite est
 * celle que Stripe vient de confirmer, donc le webhook réécrira la même —
 * aucune divergence possible.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "./database.types"
import { getAdminSupabase } from "./admin-supabase"
import { getStripe, getPriceIdByLookupKey } from "./stripe"

/** Colonnes miroir d'un entitlement. Écrites par le webhook ET par ici. */
export type AddonColumn = "subscription_has_pricing" | "subscription_has_mailing"

/**
 * Le correctif à écrire, en clair plutôt qu'en clé calculée.
 *
 * `{ [column]: enable }` compile en un index signature que les types générés
 * de Supabase refusent — et le contourner par un cast ferait sauter la seule
 * vérification qui garantit qu'on écrit une colonne existante. Sur une
 * colonne de facturation, c'est exactement ce qu'on ne veut pas perdre.
 */
function patchFor(column: AddonColumn, enable: boolean) {
  return column === "subscription_has_pricing"
    ? { subscription_has_pricing: enable }
    : { subscription_has_mailing: enable }
}

export type AddonToggleResult =
  | { ok: true; enabled: boolean; unchanged: boolean }
  | { ok: false; status: number; error: string; message?: string }

export async function toggleSubscriptionAddon(opts: {
  sb: SupabaseClient<Database>
  userId: string
  /** Clé du prix dans le catalogue Stripe, ex. `mailing_addon`. */
  lookupKey: string
  column: AddonColumn
  enable: boolean
  /** Nom lisible de l'option, pour le message d'absence d'abonnement. */
  label: string
}): Promise<AddonToggleResult> {
  const { sb, userId, lookupKey, column, enable, label } = opts

  const { data: profile } = await sb
    .from("profiles")
    .select("organization_id, role")
    .eq("user_id", userId)
    .single()
  if (!profile?.organization_id) {
    return { ok: false, status: 404, error: "no_organization" }
  }
  if (profile.role !== "owner") {
    return {
      ok: false, status: 403, error: "owner_only",
      message: "Seul le propriétaire peut modifier l'abonnement.",
    }
  }

  const admin = getAdminSupabase()
  const { data: org } = await admin
    .from("organizations")
    .select("id, stripe_subscription_id")
    .eq("id", profile.organization_id)
    .single()

  if (!org?.stripe_subscription_id) {
    return {
      ok: false, status: 400, error: "no_subscription",
      message: `Aucun abonnement actif. Souscrivez d'abord — vous pourrez inclure ${label} directement.`,
    }
  }

  try {
    const stripe = getStripe()
    const sub = await stripe.subscriptions.retrieve(org.stripe_subscription_id)
    const item = sub.items.data.find((i) => i.price?.lookup_key === lookupKey)

    if (enable === !!item) {
      await admin.from("organizations").update(patchFor(column, enable)).eq("id", org.id)
      return { ok: true, enabled: enable, unchanged: true }
    }

    if (enable) {
      const priceId = await getPriceIdByLookupKey(lookupKey)
      await stripe.subscriptionItems.create({
        subscription: sub.id,
        price: priceId,
        quantity: 1,
        proration_behavior: "create_prorations",
      })
    } else {
      await stripe.subscriptionItems.del(item!.id, { proration_behavior: "create_prorations" })
    }

    await admin.from("organizations").update(patchFor(column, enable)).eq("id", org.id)
    return { ok: true, enabled: enable, unchanged: false }
  } catch (err) {
    // Le message de Stripe peut nommer un identifiant de prix ou de compte :
    // journalisé, jamais renvoyé au client.
    console.error(`[stripe-addon:${lookupKey}] échec:`, err instanceof Error ? err.message : err)
    return {
      ok: false, status: 502, error: "addon_update_failed",
      message: "Modification impossible pour le moment. Réessayez ou contactez le support.",
    }
  }
}
