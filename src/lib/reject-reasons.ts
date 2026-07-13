/**
 * Reject reasons — raisons d'écart proposées au sourceur quand il marque
 * un match comme "rejected" / "Ne pas retenir".
 *
 * Aligné sur la contrainte CHECK côté DB (migration 023). À étendre, mettre
 * à jour la migration ET ce fichier.
 */

import type { MatchAssessment } from "./database.types"
import type { Lang } from "./i18n/LanguageContext"

export type RejectReason = NonNullable<MatchAssessment["reject_reason"]>

/** @deprecated Prefer REJECT_REASON_OPTIONS_BY_LANG[lang]. Kept (French) for
 *  callers not yet migrated to the bilingual version (RejectReasonPicker,
 *  the /api/match/[id]/stage validation route). */
export const REJECT_REASON_OPTIONS: ReadonlyArray<{ value: RejectReason; label: string; short: string }> = [
  { value: "too_expensive",     label: "Trop cher (TJM ou brut hors budget)", short: "Trop cher" },
  { value: "not_available",     label: "Pas disponible aux dates demandées",  short: "Pas dispo" },
  { value: "wrong_stack",       label: "Stack technique pas aligné",          short: "Stack" },
  { value: "seniority_mismatch", label: "Séniorité insuffisante / trop élevée", short: "Séniorité" },
  { value: "location_mismatch", label: "Localisation incompatible",           short: "Localisation" },
  { value: "other",             label: "Autre",                               short: "Autre" },
]

export const REJECT_REASON_OPTIONS_BY_LANG: Record<Lang, ReadonlyArray<{ value: RejectReason; label: string; short: string }>> = {
  fr: REJECT_REASON_OPTIONS,
  en: [
    { value: "too_expensive",      label: "Too expensive (daily rate or salary over budget)", short: "Too expensive" },
    { value: "not_available",      label: "Not available on requested dates",                 short: "Not available" },
    { value: "wrong_stack",        label: "Tech stack not aligned",                            short: "Stack" },
    { value: "seniority_mismatch", label: "Seniority too low / too high",                      short: "Seniority" },
    { value: "location_mismatch",  label: "Location incompatible",                             short: "Location" },
    { value: "other",              label: "Other",                                             short: "Other" },
  ],
}

export const REJECT_REASON_BY_VALUE: Record<RejectReason, { label: string; short: string }> = Object.fromEntries(
  REJECT_REASON_OPTIONS.map(({ value, label, short }) => [value, { label, short }]),
) as Record<RejectReason, { label: string; short: string }>

function rejectReasonByValue(lang: Lang): Record<RejectReason, { label: string; short: string }> {
  return Object.fromEntries(
    REJECT_REASON_OPTIONS_BY_LANG[lang].map(({ value, label, short }) => [value, { label, short }]),
  ) as Record<RejectReason, { label: string; short: string }>
}

export function rejectReasonLabel(v: RejectReason | null | undefined, lang: Lang = "fr"): string {
  if (!v) return "—"
  return rejectReasonByValue(lang)[v]?.short ?? v
}
