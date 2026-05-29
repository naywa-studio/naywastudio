/**
 * Métadonnées avantages cabinet — source unique pour le wizard d'onboarding,
 * la page de paramétrage et tout endroit qui demande à l'utilisateur de saisir
 * ces valeurs. Chaque entrée porte :
 *
 *   - label / hint contextuel (formules, valeurs moyennes marché)
 *   - defaultValue : valeur sensée lorsqu'on coche l'avantage
 *   - suffix : unité (€/mois, €/an, €/jour)
 *   - max / step : bornes du champ numérique
 *   - warning(v) : message orange "fiscalement vigilant" si plafond URSSAF dépassé
 *
 * Le but : l'utilisateur n'a pas besoin de connaître les plafonds 2026, le
 * formulaire les rappelle automatiquement.
 */

import type { PricingDefaultAvantages } from "@/lib/database.types"

export type AvantageKey =
  | "mutuellePremium"
  | "transport"
  | "forfaitMobilite"
  | "ticketsResto"
  | "medecineDuTravailAnnuel"
  | "indemniteKilometriqueAnnuelle"
  | "urssafIndemniteJour"
  | "expatriationMensuelle"
  | "autresMensuels"

export type AvantageSuffix = "€/mois" | "€/an" | "€/jour"

export interface AvantageConfig {
  key: AvantageKey
  label: string
  hint: string
  /** Valeur appliquée quand l'utilisateur active l'avantage pour la première fois. */
  defaultValue: number
  suffix: AvantageSuffix
  max: number
  step?: number
  /** Renvoie un message orange à afficher quand la valeur dépasse un plafond
   *  URSSAF / légal — sans bloquer la saisie. */
  warning?: (v: number) => string | null
}

export const AVANTAGES_CONFIG: AvantageConfig[] = [
  {
    key: "mutuellePremium",
    label: "Mutuelle santé",
    hint: "Part employeur — au-delà des 50 % minimum légaux. Moyenne marché : 30–60 €/mois.",
    defaultValue: 50,
    suffix: "€/mois",
    max: 500,
  },
  {
    key: "transport",
    label: "Transport (Navigo / TCL / abonnement)",
    hint: "50 % du titre = obligation employeur. Paris ≈ 43 €/mois · Lyon TCL ≈ 32 €/mois · province : selon réseau.",
    defaultValue: 43,
    suffix: "€/mois",
    max: 300,
  },
  {
    key: "forfaitMobilite",
    label: "Forfait mobilité durable",
    hint: "Vélo, covoiturage, autopartage. Plafond URSSAF 2026 : 800 €/an (≈ 67 €/mois) exonéré de charges.",
    defaultValue: 30,
    suffix: "€/mois",
    max: 200,
    warning: (v) => v > 67 ? "⚠ Dépasse le plafond URSSAF (67 €/mois). Le surplus est soumis à charges." : null,
  },
  {
    key: "ticketsResto",
    label: "Tickets restaurant",
    hint: "Part employeur €/jour travaillé. La part employeur doit représenter 50–60 % du titre.",
    defaultValue: 6,
    suffix: "€/jour",
    max: 10,
    step: 0.1,
    warning: (v) => v > 7.18 ? "⚠ Dépasse le plafond URSSAF 2026 (7,18 €/j). Au-delà = soumis à charges." : null,
  },
  {
    key: "medecineDuTravailAnnuel",
    label: "Médecine du travail",
    hint: "Cotisation SST — obligation employeur. Moyenne : 80–150 €/an par salarié.",
    defaultValue: 100,
    suffix: "€/an",
    max: 500,
  },
  {
    key: "indemniteKilometriqueAnnuelle",
    label: "Indemnité kilométrique annuelle",
    hint: "Si véhicule personnel utilisé pour le pro. Barème URSSAF selon la puissance du véhicule (CV).",
    defaultValue: 600,
    suffix: "€/an",
    max: 5000,
  },
  {
    key: "urssafIndemniteJour",
    label: "URSSAF indemnité grand déplacement",
    hint: "Plafond Paris / Petite Couronne : 117,10 €/j · autres zones : 97,90 €/j (URSSAF 2026).",
    defaultValue: 80,
    suffix: "€/jour",
    max: 200,
    step: 0.5,
    warning: (v) => {
      if (v > 117.10) return "⚠ Dépasse le plafond maximum (117,10 €/j). Au-delà = soumis à charges."
      if (v > 97.90)  return "ℹ Au-dessus du plafond hors Paris/PC (97,90 €/j) — OK uniquement Paris/PC."
      return null
    },
  },
  {
    key: "expatriationMensuelle",
    label: "Prime d'expatriation",
    hint: "Uniquement pour missions à l'étranger. Souvent 0 sinon contractuel.",
    defaultValue: 500,
    suffix: "€/mois",
    max: 5000,
  },
  {
    key: "autresMensuels",
    label: "Autres avantages mensuels",
    hint: "Catch-all : tout avantage récurrent non listé ci-dessus.",
    defaultValue: 50,
    suffix: "€/mois",
    max: 1000,
  },
]

/**
 * Estime un coût mensuel total des avantages activés, pour donner au
 * sourceur un récap "voilà ce que coûte mon cabinet en avantages /mois".
 *
 * - tickets resto : × 21 jours ouvrés moyens
 * - annuels      : / 12 pour mensualiser
 * - URSSAF grand déplacement : NON inclus (conditionnel — n'est versé qu'en
 *   période de déplacement effectif, pas chaque mois)
 */
export function avantagesMonthlyTotal(av: PricingDefaultAvantages | null | undefined): number {
  const a = av ?? {}
  const mensualises =
    (a.mutuellePremium ?? 0) +
    (a.transport ?? 0) +
    (a.forfaitMobilite ?? 0) +
    (a.expatriationMensuelle ?? 0) +
    (a.autresMensuels ?? 0)
  const ticketRestoMonthly = (a.ticketsResto ?? 0) * 21
  const medecineMonthly    = (a.medecineDuTravailAnnuel ?? 0) / 12
  const kmMonthly          = (a.indemniteKilometriqueAnnuelle ?? 0) / 12
  return mensualises + ticketRestoMonthly + medecineMonthly + kmMonthly
}
