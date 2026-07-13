/**
 * Helpers d'affichage pour les critères (PR-Z).
 *
 * Centralise la mise en forme — label compact ("Allemand B2"), couleurs
 * tier, badge yes/no/unknown — pour ne pas dupliquer entre la page
 * mission, la fiche match et le wizard onboarding.
 */

import type { Criterion, CriterionEval, CriterionType } from "./job-criteria-catalog"
import { CRITERION_CATALOG, kindOf } from "./job-criteria-catalog"
import type { Lang } from "./i18n/LanguageContext"

const LANG_NAMES: Record<Lang, Record<string, string>> = {
  fr: {
    fr: "Français", en: "Anglais", de: "Allemand", es: "Espagnol",
    it: "Italien", pt: "Portugais", ru: "Russe", ar: "Arabe",
    zh: "Chinois", ja: "Japonais", nl: "Néerlandais",
  },
  en: {
    fr: "French", en: "English", de: "German", es: "Spanish",
    it: "Italian", pt: "Portuguese", ru: "Russian", ar: "Arabic",
    zh: "Chinese", ja: "Japanese", nl: "Dutch",
  },
}

const displayCopy = {
  fr: { license: "Permis" },
  en: { license: "License" },
}

/** Libellé court mais explicite pour un critère configuré sur une mission.
 *  Ex: { type: "language", params: { code: "de", level_min: "B2" } } → "Allemand B2".
 *  Le `label` LLM est prioritaire s'il est plus précis que le défaut. */
export function shortCriterionLabel(c: Criterion, lang: Lang = "fr"): string {
  const p = c.params as Record<string, unknown>
  switch (c.type) {
    case "language": {
      const code = String(p.code ?? "").toLowerCase()
      const lvl = p.level_min ? ` ${String(p.level_min).toUpperCase()}` : ""
      const name = LANG_NAMES[lang][code] || code.toUpperCase() || c.label
      return `${name}${lvl}`
    }
    case "license":
      return p.code ? `${displayCopy[lang].license} ${String(p.code).toUpperCase()}` : c.label
    case "certification": {
      const min = p.min_score ? ` ≥ ${p.min_score}` : ""
      return p.name ? `${p.name}${min}` : c.label
    }
    case "diploma": {
      const lvl = p.level ? String(p.level).toUpperCase() : ""
      const school = p.school ? ` ${p.school}` : ""
      return lvl || school ? `${lvl}${school}`.trim() : c.label
    }
    case "experience_years":
      return p.min ? `≥ ${p.min} ans XP` : c.label
    case "industry_experience_years":
      return p.domain ? `${p.domain} ≥ ${p.min ?? "?"} ans` : c.label
    case "team_size":
      return p.min ? `Équipe ≥ ${p.min}` : c.label
    case "notice_period_weeks":
      return p.max ? `Préavis ≤ ${p.max} sem.` : c.label
    case "skills":
      // Le label LLM est souvent plus parlant ("Compétences Spark / Airflow").
      return c.label
    default:
      return c.label
  }
}

/** Suffixe "niveau attendu" compact à accoler au nom court sur les cartes
 *  ("Anglais" + "C1" → "Anglais C1", "TOEIC" + "≥ 800", "Diplôme" + "BAC+5",
 *  "Expérience" + "≥ 3 ans"). null si le type n'a pas de seuil parlant ou
 *  si le seuil est déjà dans le nom (permis, contrat). */
export function criterionLevelHint(c: Criterion): string | null {
  const p = c.params as Record<string, unknown>
  switch (c.type) {
    case "language":
      return p.level_min ? String(p.level_min).toUpperCase() : null
    case "certification":
      return p.min_score ? `≥ ${p.min_score}` : null
    case "diploma": {
      const lvl = p.level ? String(p.level).toUpperCase() : ""
      return lvl || (p.school ? String(p.school) : null) || null
    }
    case "experience_years":
      return p.min ? `≥ ${p.min} ans` : (p.target ? `~ ${p.target} ans` : null)
    case "industry_experience_years":
      return p.min ? `≥ ${p.min} ans` : null
    case "seniority_fit":
      return p.target ? String(p.target) : null
    case "team_size":
      return p.min ? `≥ ${p.min}` : null
    case "management_experience_years":
      return p.min ? `≥ ${p.min} ans` : null
    case "notice_period_weeks":
      return p.max ? `≤ ${p.max} sem.` : null
    default:
      return null
  }
}

/** Nom court + éventuel niveau attendu, pour l'en-tête d'un critère sur les
 *  cartes/fiche match ("Anglais C1", "TOEIC ≥ 800", "Compétences"). */
export function criterionHeaderLabel(c: Criterion, lang: Lang = "fr"): string {
  const name = shortCriterionName(c, lang)
  const hint = criterionLevelHint(c)
  return hint ? `${name} ${hint}` : name
}

/** Couleur d'une jauge quantitative. Charte violette (primary #7C63C8 /
 *  secondary #B8AEDE), tons DOUX : la barre est déjà proportionnelle au score
 *  (un score faible = barre courte), donc pas besoin d'un rouge criard. Le
 *  badge tier (Excellent/Bon/Moyen/Faible) porte le signal qualité global. */
export function dimColor(score: number | null | undefined): { color: string; bg: string; bd: string } {
  if (score == null) return { color: "#B6AEC9", bg: "#F5F3FB", bd: "#ECE8F6" }
  if (score >= 75)   return { color: "#7C63C8", bg: "rgba(124,99,200,0.10)", bd: "rgba(124,99,200,0.26)" }
  if (score >= 55)   return { color: "#8E79CF", bg: "rgba(124,99,200,0.07)", bd: "rgba(124,99,200,0.18)" }
  if (score >= 35)   return { color: "#AEA1DB", bg: "rgba(184,174,222,0.14)", bd: "rgba(184,174,222,0.30)" }
  return                { color: "#CBC3E6", bg: "rgba(184,174,222,0.10)", bd: "rgba(184,174,222,0.22)" }
}

export function statusColor(status: "yes" | "no" | "unknown" | undefined): { color: string; bg: string; bd: string; icon: string } {
  if (status === "yes")
    return { color: "#15803d", bg: "rgba(34,197,94,0.12)", bd: "rgba(34,197,94,0.30)", icon: "✓" }
  if (status === "no")
    return { color: "#B91C1C", bg: "rgba(239,68,68,0.08)", bd: "rgba(239,68,68,0.22)", icon: "✗" }
  return   { color: "#6B7280", bg: "#F3F4F6",              bd: "#E5E7EB",              icon: "?" }
}

/** Vue compacte de la valeur d'une éval (sans wrapper).
 *  Quantitatif → nombre ; Qualitatif → ✓/✗/? . */
export function evalDisplayValue(c: Criterion, e: CriterionEval | undefined): string {
  if (!e) return "—"
  if (kindOf(c.type) === "quantitative") {
    return typeof e.score === "number" ? String(e.score) : "—"
  }
  if (e.status === "yes") return "✓"
  if (e.status === "no") return "✗"
  return "?"
}

/** Couleurs pour le badge tier global. */
export function tierMeta(tier: "excellent" | "good" | "fair" | "poor" | null, lang: Lang = "fr") {
  const labels = lang === "fr"
    ? { excellent: "Excellent", good: "Bon", fair: "Moyen", poor: "Faible" }
    : { excellent: "Excellent", good: "Good", fair: "Fair", poor: "Poor" }
  switch (tier) {
    case "excellent":
      return { label: labels.excellent, color: "#15803d", bg: "rgba(34,197,94,0.12)", bd: "rgba(34,197,94,0.30)" }
    case "good":
      return { label: labels.good,      color: "#15803d", bg: "rgba(34,197,94,0.06)", bd: "rgba(34,197,94,0.20)" }
    case "fair":
      return { label: labels.fair,      color: "#B45309", bg: "rgba(245,158,11,0.08)", bd: "rgba(245,158,11,0.25)" }
    case "poor":
      return { label: labels.poor,      color: "#6B7280", bg: "#F3F4F6",                bd: "#E5E7EB" }
    default:
      return { label: "—",              color: "#9CA3AF", bg: "white",                  bd: "#E5E7EB" }
  }
}

/** Helper pour générer un libellé de type ("Compétences", "Langue", ...).
 *  Le catalogue (défaut FR) reste la source de vérité pour la valeur
 *  PERSISTÉE (fallback label stocké en base) ; ce helper ne traduit que
 *  l'AFFICHAGE. */
export function typeLabel(type: Criterion["type"], lang: Lang = "fr"): string {
  return lang === "fr" ? CRITERION_CATALOG[type].defaultLabel : TYPE_LABEL_EN[type]
}

const TYPE_LABEL_EN: Record<CriterionType, string> = {
  skills: "Technical skills",
  seniority_fit: "Seniority",
  experience_years: "Years of experience",
  role_fit: "Role fit",
  domain_fit: "Sector",
  industry_experience_years: "Sector experience",
  team_size: "Team size managed",
  management_experience_years: "Management experience",
  client_facing: "Client-facing experience",
  notice_period_weeks: "Notice period",
  language: "Language",
  license: "License",
  certification: "Certification",
  diploma: "Diploma",
  mobility: "Mobility",
  availability: "Availability",
  legal_status: "Legal status",
  clearance: "Clearance",
  methodology: "Methodology",
  contract_preference: "Contract type",
  salary_expectation: "Salary expectations",
  travel_willingness: "Travel",
  publication_portfolio: "Portfolio / publications",
  physical_requirements: "Physical requirements",
  custom: "Custom criterion",
}

/** Libellés ultra-courts (1-2 mots) par type, pour l'affichage compact
 *  dans les cartes candidat / jauges. Les libellés LLM verbeux
 *  ("Compétences commerciales et relationnelles") deviennent illisibles
 *  côte à côte — ici on veut juste identifier la dimension d'un coup d'œil. */
const SHORT_TYPE_NAME: Record<Lang, Record<CriterionType, string>> = {
  fr: {
    skills: "Compétences",
    seniority_fit: "Séniorité",
    experience_years: "Expérience",
    role_fit: "Métier",
    domain_fit: "Domaine",
    industry_experience_years: "Secteur",
    team_size: "Management",
    management_experience_years: "Management",
    client_facing: "Relation client",
    notice_period_weeks: "Préavis",
    language: "Langue",
    license: "Permis",
    certification: "Certification",
    diploma: "Diplôme",
    mobility: "Mobilité",
    availability: "Disponibilité",
    legal_status: "Statut",
    clearance: "Habilitation",
    methodology: "Méthode",
    contract_preference: "Contrat",
    salary_expectation: "Salaire",
    travel_willingness: "Déplacements",
    publication_portfolio: "Portfolio",
    physical_requirements: "Aptitude",
    custom: "Critère",
  },
  en: {
    skills: "Skills",
    seniority_fit: "Seniority",
    experience_years: "Experience",
    role_fit: "Role",
    domain_fit: "Domain",
    industry_experience_years: "Sector",
    team_size: "Management",
    management_experience_years: "Management",
    client_facing: "Client-facing",
    notice_period_weeks: "Notice",
    language: "Language",
    license: "License",
    certification: "Certification",
    diploma: "Diploma",
    mobility: "Mobility",
    availability: "Availability",
    legal_status: "Status",
    clearance: "Clearance",
    methodology: "Method",
    contract_preference: "Contract",
    salary_expectation: "Salary",
    travel_willingness: "Travel",
    publication_portfolio: "Portfolio",
    physical_requirements: "Aptitude",
    custom: "Criterion",
  },
}

/** Nom court (1-2 mots) d'un critère pour l'affichage compact. Pour
 *  certains types, on précise avec un param clé (langue → "Allemand",
 *  certif → "TOEIC", permis → "Permis B"). Sinon nom générique du type. */
export function shortCriterionName(c: Criterion, lang: Lang = "fr"): string {
  const p = c.params as Record<string, unknown>
  const names = SHORT_TYPE_NAME[lang]
  switch (c.type) {
    case "language": {
      const code = String(p.code ?? "").toLowerCase()
      return LANG_NAMES[lang][code] || names.language
    }
    case "license":
      return p.code ? `${displayCopy[lang].license} ${String(p.code).toUpperCase()}` : names.license
    case "certification":
      return p.name ? String(p.name) : names.certification
    case "contract_preference": {
      // "alternance", "cdi"… si un seul type demandé, on l'affiche.
      const kinds = Array.isArray(p.kinds) ? p.kinds : []
      if (kinds.length === 1) {
        const k = String(kinds[0])
        return k.charAt(0).toUpperCase() + k.slice(1)
      }
      return names.contract_preference
    }
    case "custom": {
      // Le libellé porte le sens ("Kafka", "Azure"…). Le générique "Critère"
      // ne dit rien au sourceur sur les cartes → on affiche le libellé (ou la
      // description en params), tronqué pour rester compact.
      const label = (c.label || String(p.description ?? "")).trim()
      return label ? (label.length > 22 ? `${label.slice(0, 21)}…` : label) : names.custom
    }
    default:
      return names[c.type] ?? c.label
  }
}
