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

const MS_PER_DAY = 24 * 60 * 60 * 1000

/** Durée de la fenêtre de grâce (lecture seule) avant wipe, en jours.
 *  Unifiée : résiliation Stripe, impayé, essai expiré, suppression explicite.
 *  Passé ce délai un cron wipe (données business pour un lapse d'abonnement /
 *  d'essai, compte entier pour une suppression explicite). */
export const GRACE_DAYS = 30

/** Cause de la mise en lecture seule d'une org.
 *   - "deletion"     : l'owner a demandé la suppression (recouvrable 30 j).
 *   - "subscription" : abonnement résilié / impayé (Stripe).
 *   - "trial"        : essai gratuit expiré sans abonnement pris. */
export type GraceCause = "deletion" | "subscription" | "trial"

export interface GraceInfo {
  /** Vrai tant qu'on est DANS la fenêtre (endsAt dans le futur). */
  inGrace: boolean
  /** Date de fin de grâce (= date de wipe prévue). */
  endsAt: Date | null
  cause: GraceCause | null
}

/** Fenêtre de grâce unifiée. Une org "suspendue" (résiliation, impayé, essai
 *  expiré) OU en cours de suppression explicite reste accessible en LECTURE
 *  SEULE le temps d'exporter ses données (RGPD) et de réactiver / annuler.
 *  Priorité : suppression explicite > abonnement > essai. */
export function graceInfo(
  org: Pick<
    Organization,
    "trial_ends_at" | "subscription_status" | "current_period_end" | "lockdown_started_at" | "pending_deletion_at"
  > | null | undefined,
  nowMs: number = Date.now(),
  opts?: { isAdmin?: boolean },
): GraceInfo {
  const none: GraceInfo = { inGrace: false, endsAt: null, cause: null }
  if (opts?.isAdmin || !org) return none

  // 1) Suppression explicite demandée par l'owner — prioritaire et
  //    recouvrable (bouton "Annuler la suppression"), même si l'abo est
  //    encore actif : on a demandé à supprimer, plus de mutations.
  if (org.pending_deletion_at) {
    const endsAt = new Date(org.pending_deletion_at)
    return { inGrace: nowMs < endsAt.getTime(), endsAt, cause: "deletion" }
  }

  // 2) Accès actif (essai en cours / abo payé) → pas de grâce.
  if (hasActiveAccess(org)) return none

  // 3) Abonnement résilié / impayé — grâce à partir du stamp lockdown posé
  //    par le webhook Stripe.
  if (org.lockdown_started_at) {
    const endsAt = new Date(new Date(org.lockdown_started_at).getTime() + GRACE_DAYS * MS_PER_DAY)
    return { inGrace: nowMs < endsAt.getTime(), endsAt, cause: "subscription" }
  }

  // 4) Essai gratuit expiré sans abonnement — grâce à partir de trial_ends_at.
  if (org.trial_ends_at) {
    const trialEndMs = new Date(org.trial_ends_at).getTime()
    if (nowMs >= trialEndMs) {
      const endsAt = new Date(trialEndMs + GRACE_DAYS * MS_PER_DAY)
      return { inGrace: nowMs < endsAt.getTime(), endsAt, cause: "trial" }
    }
  }

  return none
}

/** Le workspace doit-il être en LECTURE SEULE pour ce user ? Vrai dès qu'une
 *  suppression est programmée OU que l'org n'a plus d'accès actif (résiliation,
 *  impayé, essai expiré) — indépendamment de la fenêtre de grâce (reste read-only
 *  jusqu'au wipe). Les mutations serveur sont de toute façon bloquées
 *  (requireActiveAccess) ; ceci grise l'UI en cohérence. */
export function isWorkspaceReadOnly(
  org: Pick<
    Organization,
    "trial_ends_at" | "subscription_status" | "current_period_end" | "pending_deletion_at"
  > | null | undefined,
  opts?: { isAdmin?: boolean },
): boolean {
  if (opts?.isAdmin || !org) return false
  if (org.pending_deletion_at) return true
  return !hasActiveAccess(org)
}

/** Lockdown actif = sub past_due/unpaid/canceled dans la fenêtre de grâce.
 *  Conservé pour les bannières + la résolution de quotas. Aligné sur
 *  GRACE_DAYS (30 j). Pour la logique unifiée (lecture seule, essai expiré,
 *  suppression), préférer `graceInfo` / `isWorkspaceReadOnly`. */
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
  const elapsedDays = (nowMs - startMs) / MS_PER_DAY
  return elapsedDays >= 0 && elapsedDays <= GRACE_DAYS
}
