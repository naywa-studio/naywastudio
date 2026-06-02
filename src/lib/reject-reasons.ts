/**
 * Reject reasons — raisons d'écart proposées au sourceur quand il marque
 * un match comme "rejected" / "Ne pas retenir".
 *
 * Aligné sur la contrainte CHECK côté DB (migration 023). À étendre, mettre
 * à jour la migration ET ce fichier.
 */

import type { MatchAssessment } from "./database.types"

export type RejectReason = NonNullable<MatchAssessment["reject_reason"]>

export const REJECT_REASON_OPTIONS: ReadonlyArray<{ value: RejectReason; label: string; short: string }> = [
  { value: "too_expensive",     label: "Trop cher (TJM ou brut hors budget)", short: "Trop cher" },
  { value: "not_available",     label: "Pas disponible aux dates demandées",  short: "Pas dispo" },
  { value: "wrong_stack",       label: "Stack technique pas aligné",          short: "Stack" },
  { value: "seniority_mismatch", label: "Séniorité insuffisante / trop élevée", short: "Séniorité" },
  { value: "location_mismatch", label: "Localisation incompatible",           short: "Localisation" },
  { value: "other",             label: "Autre",                               short: "Autre" },
]

export const REJECT_REASON_BY_VALUE: Record<RejectReason, { label: string; short: string }> = Object.fromEntries(
  REJECT_REASON_OPTIONS.map(({ value, label, short }) => [value, { label, short }]),
) as Record<RejectReason, { label: string; short: string }>

export function rejectReasonLabel(v: RejectReason | null | undefined): string {
  if (!v) return "—"
  return REJECT_REASON_BY_VALUE[v]?.short ?? v
}
