/**
 * Subscription state helpers — pure functions, no Stripe SDK.
 *
 * Decides whether a cabinet can access the workspace given the current
 * combination of trial state and Stripe subscription state. The rule :
 *
 *   accessible = trial_active  OR  subscription_status IN ('trialing','active')
 *
 * `trial_active` is the legacy 15-day free trial flag (lib/trial.ts).
 * `subscription_status` is the Stripe mirror set by the webhook.
 */

import type { Organization } from "./database.types"
import { trialStatus } from "./trial"

export type SubscriptionAccess =
  | { state: "trial";   reason: "trial_active";       daysLeft: number }
  | { state: "paid";    reason: "stripe_active";      until: Date | null }
  | { state: "trialing"; reason: "stripe_trialing";   until: Date | null }
  /** L'utilisateur est un admin Naywa. Aucune gate ne s'applique. */
  | { state: "admin";   reason: "admin_bypass" }
  | { state: "blocked"; reason: "trial_pending" | "trial_expired" | "subscription_expired" | "subscription_canceled" | "no_subscription" }

export function subscriptionAccess(
  org: Pick<
    Organization,
    "trial_ends_at" | "subscription_status" | "current_period_end"
  > | null | undefined,
  /** Option : si le caller est un admin Naywa, on bypass tous les gates
   *  (essai, paiement, lockdown). Le flag doit être lu côté server à
   *  partir de profiles.is_admin — jamais depuis le body du client. */
  opts?: { isAdmin?: boolean },
): SubscriptionAccess {
  if (opts?.isAdmin) return { state: "admin", reason: "admin_bypass" }
  if (!org) return { state: "blocked", reason: "no_subscription" }

  // Stripe subscription wins if it's active. Trial only matters before
  // the first paid Checkout.
  const status = org.subscription_status
  if (status === "active") {
    return {
      state: "paid",
      reason: "stripe_active",
      until: org.current_period_end ? new Date(org.current_period_end) : null,
    }
  }
  if (status === "trialing") {
    return {
      state: "trialing",
      reason: "stripe_trialing",
      until: org.current_period_end ? new Date(org.current_period_end) : null,
    }
  }
  if (status === "past_due" || status === "unpaid") {
    return { state: "blocked", reason: "subscription_expired" }
  }
  if (status === "canceled" || status === "incomplete_expired") {
    return { state: "blocked", reason: "subscription_canceled" }
  }
  // `incomplete` / `paused` / unknown → fall through to trial check

  // Legacy free trial path.
  const trial = trialStatus(org)
  if (trial.state === "active") {
    return { state: "trial", reason: "trial_active", daysLeft: trial.daysLeft }
  }
  if (trial.state === "pending") {
    return { state: "blocked", reason: "trial_pending" }
  }
  return { state: "blocked", reason: "trial_expired" }
}

/** Single boolean used by guards (proxy, layout, route handlers). */
export function hasActiveAccess(
  org: Pick<
    Organization,
    "trial_ends_at" | "subscription_status" | "current_period_end"
  > | null | undefined,
  opts?: { isAdmin?: boolean },
): boolean {
  const acc = subscriptionAccess(org, opts)
  return (
    acc.state === "trial" ||
    acc.state === "paid" ||
    acc.state === "trialing" ||
    acc.state === "admin"
  )
}

/** L'org a-t-elle accès à la Suite Pricing (champs pricing mission, page
 *  pricing, comparaison salaire) ? Règle produit :
 *    - admin Naywa → toujours ;
 *    - abonnement Stripe avec l'option pricing (subscription_has_pricing) ;
 *    - essai gratuit 15 j actif → accès complet, pricing compris.
 *  Le salaire cible du poste + la prétention candidat NE dépendent PAS de ça
 *  (universels aux équipes de sourcing) — cf. formulaire mission / fiche match. */
export function hasPricingAccess(
  org: Pick<
    Organization,
    "trial_ends_at" | "subscription_status" | "current_period_end" | "subscription_has_pricing"
  > | null | undefined,
  opts?: { isAdmin?: boolean },
): boolean {
  if (opts?.isAdmin) return true
  if (!org) return false
  if (org.subscription_has_pricing) return true
  // Essai gratuit = accès complet (l'abonnement Stripe, lui, respecte l'option).
  return subscriptionAccess(org, opts).state === "trial"
}

/** Lockdown actif = sub past_due/unpaid/canceled mais avant le wipe à
 *  J+15. Le workspace doit rester accessible en LECTURE SEULE pour
 *  permettre l'export RGPD et donner une dernière chance de régulariser.
 *
 *  Pas de lockdown si :
 *    - lockdown_started_at n'est pas posé
 *    - le cron de wipe a déjà passé (lockdown_started_at + 15 j)
 *    - l'org a une access active (trial/paid/trialing) — le webhook
 *      aurait dû clear le lockdown_started_at mais on est défensif. */
export function isInLockdown(
  org: Pick<
    Organization,
    "trial_ends_at" | "subscription_status" | "current_period_end" | "lockdown_started_at"
  > | null | undefined,
  /** Optionnel — passé en paramètre pour tester (Date.now() en prod). */
  nowMs: number = Date.now(),
  opts?: { isAdmin?: boolean },
): boolean {
  if (opts?.isAdmin) return false
  if (!org?.lockdown_started_at) return false
  if (hasActiveAccess(org)) return false
  const startMs = new Date(org.lockdown_started_at).getTime()
  const elapsedDays = (nowMs - startMs) / (24 * 60 * 60 * 1000)
  return elapsedDays >= 0 && elapsedDays <= 15
}
