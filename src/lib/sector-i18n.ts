/**
 * Traduction d'AFFICHAGE des noms de secteur — PAS de la donnée stockée.
 *
 * Les secteurs sont une donnée métier PARTAGÉE par toute l'org (matching,
 * filtres, `candidates.sectors`, `jobs.target_sectors` comparent des
 * chaînes) : on ne peut pas stocker un nom différent par langue sans casser
 * cette comparaison pour les membres qui n'ont pas la même préférence de
 * langue. Le nom canonique reste donc TOUJOURS celui stocké (les 12 seeds
 * de `sector-defaults.ts`, en français).
 *
 * Cette table ne fait que retraduire l'AFFICHAGE des 12 secteurs seed
 * connus quand `lang === "en"`. Les secteurs créés par l'org (par
 * l'utilisateur ou par Nora, au-delà des 12 par défaut) n'ont pas de
 * traduction connue et s'affichent tels quels — limitation connue, comme
 * pour le reste du contenu métier (CV, briefs).
 */

import type { Lang } from "@/lib/i18n/LanguageContext"

const SECTOR_LABEL_EN: Record<string, string> = {
  "Commercial": "Sales",
  "Immobilier": "Real Estate",
  "Finance / Comptabilité": "Finance / Accounting",
  "Marketing / Communication": "Marketing / Communications",
  "Ressources humaines": "Human Resources",
  "IT / Data": "IT / Data",
  "Ingénierie": "Engineering",
  "Juridique": "Legal",
  "Santé": "Healthcare",
  "Logistique / Supply chain": "Logistics / Supply Chain",
  "BTP / Construction": "Construction",
  "Hôtellerie / Restauration": "Hospitality / Food Service",
}

/** Nom affiché d'un secteur selon la langue. Ne change jamais la valeur
 *  stockée/comparée — usage RENDU UNIQUEMENT. */
export function sectorDisplayName(name: string, lang: Lang): string {
  if (lang !== "en") return name
  return SECTOR_LABEL_EN[name] ?? name
}
