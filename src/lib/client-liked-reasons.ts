/**
 * Motifs POSITIFS client — ce qui a PLU au client sur un candidat retenu
 * (stades interview / offer / hired). Miroir symétrique de
 * `lib/client-reject-reasons`. Universels, MULTIPLES et NON bloquants.
 *
 * Ces signaux remontent dans le contexte de la mission → matière pour Nora,
 * qui RENFORCE / CONSERVE les critères que les candidats retenus satisfont
 * (au lieu de seulement assouplir sur les écartés).
 */

import type { Lang } from "./i18n/LanguageContext"

export type ClientLikedReason =
  | "skills"
  | "seniority"
  | "experience"
  | "sector_experience"
  | "soft_skills"
  | "motivation"
  | "availability"
  | "salary_fit"
  | "other"

export const CLIENT_LIKED_REASONS: ClientLikedReason[] = [
  "skills", "seniority", "experience", "sector_experience",
  "soft_skills", "motivation", "availability", "salary_fit", "other",
]

const LABELS: Record<Lang, Record<ClientLikedReason, string>> = {
  fr: {
    skills: "Compétences au niveau",
    seniority: "Bonne séniorité",
    experience: "Expérience solide",
    sector_experience: "Expérience secteur",
    soft_skills: "Savoir-être / posture",
    motivation: "Motivation / projet",
    availability: "Disponibilité / démarrage",
    salary_fit: "Prétentions alignées",
    other: "Autre",
  },
  en: {
    skills: "Right skills",
    seniority: "Right seniority",
    experience: "Solid experience",
    sector_experience: "Sector experience",
    soft_skills: "Soft skills / attitude",
    motivation: "Motivation / project fit",
    availability: "Availability / start date",
    salary_fit: "Salary in range",
    other: "Other",
  },
}

const VALUES = new Set<string>(CLIENT_LIKED_REASONS)

export function isClientLikedReason(v: unknown): v is ClientLikedReason {
  return typeof v === "string" && VALUES.has(v)
}

export function clientLikedReasonLabel(reason: ClientLikedReason, lang: Lang): string {
  return LABELS[lang][reason]
}

/** Nettoie un tableau reçu du client : garde les valeurs connues, dédoublonne. */
export function sanitizeClientLikedReasons(input: unknown): ClientLikedReason[] {
  if (!Array.isArray(input)) return []
  return Array.from(new Set(input.filter(isClientLikedReason)))
}
