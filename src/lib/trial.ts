/**
 * Trial helpers.
 *
 * Pure functions — no Supabase, no React, just date math. The 15-day
 * trial is advisory only until Stripe wiring : we never lock the UI,
 * we only flip the banner to red after expiry.
 */

import type { Organization } from "./database.types"

export const TRIAL_DURATION_DAYS = 15

/** Nombre maximum de sièges utilisables pendant l'essai gratuit.
 *  Au-delà, la structure doit souscrire à un abonnement payant.
 *  Règle voulue : trial = test à 2 personnes max, pas une équipe entière. */
export const TRIAL_SEAT_CAP = 2

export type TrialState = "pending" | "active" | "expired"

export interface TrialStatus {
  state:     TrialState
  daysLeft:  number       // floor(); 0 when expired or pending
  endsAt:    Date | null  // null when pending
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

export function trialStatus(
  organization: Pick<Organization, "trial_ends_at"> | null | undefined,
): TrialStatus {
  if (!organization?.trial_ends_at) {
    return { state: "pending", daysLeft: 0, endsAt: null }
  }
  const endsAt = new Date(organization.trial_ends_at)
  const diffMs = endsAt.getTime() - Date.now()
  if (diffMs <= 0) {
    return { state: "expired", daysLeft: 0, endsAt }
  }
  // Round UP so "11h left" still reads as "1 jour restant" — feels less
  // brutal mid-day. Pas de cap : l'admin peut prolonger l'essai bien
  // au-delà de TRIAL_DURATION_DAYS (cf. /api/admin/trial), donc capper
  // au défaut afficherait une valeur fausse.
  const daysLeft = Math.max(1, Math.ceil(diffMs / MS_PER_DAY))
  return { state: "active", daysLeft, endsAt }
}

export function computeTrialEndsAt(now: Date = new Date()): Date {
  const ends = new Date(now)
  ends.setDate(ends.getDate() + TRIAL_DURATION_DAYS)
  return ends
}
