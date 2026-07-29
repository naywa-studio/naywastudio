/**
 * Type d'organisation — fondation du segment cabinet/ESN.
 *
 * Distingue les structures qui recrutent POUR des clients (placement / régie)
 * des équipes de recrutement INTERNES. Le type est choisi à l'onboarding et
 * pilote l'affichage des fonctionnalités « côté client » (annuaire clients,
 * politique de pricing). Une équipe interne ne facture personne → ni clients
 * ni pricing.
 *
 * SOURCE UNIQUE de la sémantique du type : l'UI et les routes passent par les
 * helpers ci-dessous, jamais par des comparaisons de chaîne éparses.
 */

export type OrgType = "cabinet_recrutement" | "esn_conseil" | "equipe_interne"

export const ORG_TYPES: OrgType[] = [
  "cabinet_recrutement",
  "esn_conseil",
  "equipe_interne",
]

/** Libellés + descriptions pour l'onboarding et les réglages. */
export const ORG_TYPE_META: Record<
  OrgType,
  { label: { fr: string; en: string }; hint: { fr: string; en: string } }
> = {
  cabinet_recrutement: {
    label: { fr: "Cabinet de recrutement", en: "Recruitment agency" },
    hint: {
      fr: "Vous placez des candidats chez vos clients (facturation en honoraires).",
      en: "You place candidates with your clients (fee-based billing).",
    },
  },
  esn_conseil: {
    label: { fr: "ESN, bureau d'étude ou conseil", en: "Consulting / IT services firm" },
    hint: {
      fr: "Vous placez des consultants en régie chez vos clients (facturation au TJM).",
      en: "You place consultants on client assignments (day-rate billing).",
    },
  },
  equipe_interne: {
    label: { fr: "Équipe de recrutement interne", en: "In-house recruitment team" },
    hint: {
      fr: "Vous recrutez pour votre propre entreprise, sans client externe.",
      en: "You recruit for your own company, with no external client.",
    },
  },
}

/** Type par défaut appliqué aux orgs pré-migration (le plus permissif). */
export const DEFAULT_ORG_TYPE: OrgType = "cabinet_recrutement"

/** Coerce une valeur DB (potentiellement NULL / inconnue) en OrgType sûr. */
export function normalizeOrgType(value: string | null | undefined): OrgType {
  return value === "esn_conseil" || value === "equipe_interne" || value === "cabinet_recrutement"
    ? value
    : DEFAULT_ORG_TYPE
}

/** L'org travaille-t-elle POUR des clients externes ? (cabinet ou ESN) */
export function orgUsesClients(value: string | null | undefined): boolean {
  const t = normalizeOrgType(value)
  return t === "cabinet_recrutement" || t === "esn_conseil"
}

/** L'org facture-t-elle des clients → a-t-elle besoin de la politique pricing ?
 *  Une équipe interne ne facture personne. */
export function orgUsesPricing(value: string | null | undefined): boolean {
  return orgUsesClients(value)
}
