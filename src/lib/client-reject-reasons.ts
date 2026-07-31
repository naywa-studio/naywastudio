/**
 * Motifs d'écart CLIENT (segment cabinet/ESN) — pourquoi le client a écarté
 * un candidat présenté. Universels (valent pour placement, régie, interne),
 * MULTIPLES (plusieurs cochables) et NON bloquants (aucun requis).
 *
 * Distinct des reject_reason de sourcing (lib/reject-reasons, orientés régie).
 * Ces motifs remontent dans le contexte de la mission → matière pour Nora
 * (ajustement du brief + meilleur matching).
 */

import type { Lang } from "./i18n/LanguageContext"

export type ClientRejectReason =
  | "skills_gap"
  | "seniority"
  | "experience"
  | "soft_skills"
  | "salary"
  | "availability"
  | "location"
  | "motivation"
  | "other"

export const CLIENT_REJECT_REASONS: ClientRejectReason[] = [
  "skills_gap", "seniority", "experience", "soft_skills",
  "salary", "availability", "location", "motivation", "other",
]

const LABELS: Record<Lang, Record<ClientRejectReason, string>> = {
  fr: {
    skills_gap: "Compétences manquantes",
    seniority: "Séniorité inadaptée",
    experience: "Expérience insuffisante",
    soft_skills: "Savoir-être / posture",
    salary: "Prétentions salariales",
    availability: "Disponibilité / démarrage",
    location: "Localisation",
    motivation: "Motivation / adéquation projet",
    other: "Autre",
  },
  en: {
    skills_gap: "Missing skills",
    seniority: "Seniority mismatch",
    experience: "Not enough experience",
    soft_skills: "Soft skills / attitude",
    salary: "Salary expectations",
    availability: "Availability / start date",
    location: "Location",
    motivation: "Motivation / project fit",
    other: "Other",
  },
}

const VALUES = new Set<string>(CLIENT_REJECT_REASONS)

export function isClientRejectReason(v: unknown): v is ClientRejectReason {
  return typeof v === "string" && VALUES.has(v)
}

export function clientRejectReasonLabel(reason: ClientRejectReason, lang: Lang): string {
  return LABELS[lang][reason]
}

/** Nettoie un tableau reçu du client : garde les valeurs connues, dédoublonne. */
export function sanitizeClientRejectReasons(input: unknown): ClientRejectReason[] {
  if (!Array.isArray(input)) return []
  return Array.from(new Set(input.filter(isClientRejectReason)))
}
