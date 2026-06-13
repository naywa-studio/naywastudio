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
  | { state: "blocked"; reason: "trial_pending" | "trial_expired" | "subscription_expired" | "subscription_canceled" | "no_subscription" }

export function subscriptionAccess(
  org: Pick<
    Organization,
    "trial_ends_at" | "subscription_status" | "current_period_end"
  > | null | undefined,
): SubscriptionAccess {
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
): boolean {
  const acc = subscriptionAccess(org)
  return acc.state === "trial" || acc.state === "paid" || acc.state === "trialing"
}
