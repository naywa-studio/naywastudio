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
import type { Lang } from "@/lib/i18n/LanguageContext"

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
  /** Si true : obligation légale employeur → toujours actif, pas de case à
   *  cocher, le sourceur saisit juste le montant. */
  required?: boolean
  /** Renvoie un message orange à afficher quand la valeur dépasse un plafond
   *  URSSAF / légal — sans bloquer la saisie. */
  warning?: (v: number) => string | null
}

// ─── Ordre d'affichage ───
// Les avantages "required" (obligations légales) sont placés en tête pour les
// regrouper visuellement, suivi des avantages optionnels.
export const AVANTAGES_CONFIG: AvantageConfig[] = [
  // ─── Obligatoires ───
  {
    key: "mutuellePremium",
    label: "Mutuelle santé",
    hint: "Obligation employeur (mutuelle collective, ≥ 50 % à charge). Part employeur en €/mois. Moyenne marché : 30–60 €/mois.",
    defaultValue: 50,
    suffix: "€/mois",
    max: 500,
    required: true,
  },
  {
    key: "medecineDuTravailAnnuel",
    label: "Médecine du travail",
    hint: "Obligation légale employeur (cotisation SST/SPSTI). Coût annuel par salarié, moyenne marché : 80–150 €/an.",
    defaultValue: 100,
    suffix: "€/an",
    max: 500,
    required: true,
  },
  // ─── Optionnels ───
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
    key: "indemniteKilometriqueAnnuelle",
    label: "Indemnité kilométrique annuelle",
    hint: "Budget annuel cabinet pour les salariés utilisant leur véhicule perso (barème URSSAF selon CV).",
    defaultValue: 600,
    suffix: "€/an",
    max: 5000,
  },
  {
    key: "urssafIndemniteJour",
    label: "URSSAF indemnité grand déplacement",
    hint: "Tarif cabinet appliqué uniquement aux missions avec grand déplacement (activable par mission). Plafond Paris/PC : 117,10 €/j · autres zones : 97,90 €/j (URSSAF 2026).",
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
    hint: "Tarif cabinet appliqué uniquement aux missions à l'étranger (activable par mission).",
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
 * Libellés / hints / warnings traduits — utilisés uniquement par
 * `/organisation/parametrage` (UI de saisie). `AVANTAGES_CONFIG` reste en
 * français : c'est la source unique pour le PDF de chiffrage (toujours FR),
 * et porte les valeurs métier (key, defaultValue, max, step, required).
 */
export const AVANTAGES_LABELS: Record<
  Lang,
  Record<AvantageKey, { label: string; hint: string; warning?: (v: number) => string | null }>
> = {
  fr: {
    mutuellePremium: {
      label: "Mutuelle santé",
      hint: "Obligation employeur (mutuelle collective, ≥ 50 % à charge). Part employeur en €/mois. Moyenne marché : 30–60 €/mois.",
    },
    medecineDuTravailAnnuel: {
      label: "Médecine du travail",
      hint: "Obligation légale employeur (cotisation SST/SPSTI). Coût annuel par salarié, moyenne marché : 80–150 €/an.",
    },
    transport: {
      label: "Transport (Navigo / TCL / abonnement)",
      hint: "50 % du titre = obligation employeur. Paris ≈ 43 €/mois · Lyon TCL ≈ 32 €/mois · province : selon réseau.",
    },
    forfaitMobilite: {
      label: "Forfait mobilité durable",
      hint: "Vélo, covoiturage, autopartage. Plafond URSSAF 2026 : 800 €/an (≈ 67 €/mois) exonéré de charges.",
      warning: (v) => v > 67 ? "⚠ Dépasse le plafond URSSAF (67 €/mois). Le surplus est soumis à charges." : null,
    },
    ticketsResto: {
      label: "Tickets restaurant",
      hint: "Part employeur €/jour travaillé. La part employeur doit représenter 50–60 % du titre.",
      warning: (v) => v > 7.18 ? "⚠ Dépasse le plafond URSSAF 2026 (7,18 €/j). Au-delà = soumis à charges." : null,
    },
    indemniteKilometriqueAnnuelle: {
      label: "Indemnité kilométrique annuelle",
      hint: "Budget annuel cabinet pour les salariés utilisant leur véhicule perso (barème URSSAF selon CV).",
    },
    urssafIndemniteJour: {
      label: "URSSAF indemnité grand déplacement",
      hint: "Tarif cabinet appliqué uniquement aux missions avec grand déplacement (activable par mission). Plafond Paris/PC : 117,10 €/j · autres zones : 97,90 €/j (URSSAF 2026).",
      warning: (v) => {
        if (v > 117.10) return "⚠ Dépasse le plafond maximum (117,10 €/j). Au-delà = soumis à charges."
        if (v > 97.90)  return "ℹ Au-dessus du plafond hors Paris/PC (97,90 €/j) — OK uniquement Paris/PC."
        return null
      },
    },
    expatriationMensuelle: {
      label: "Prime d'expatriation",
      hint: "Tarif cabinet appliqué uniquement aux missions à l'étranger (activable par mission).",
    },
    autresMensuels: {
      label: "Autres avantages mensuels",
      hint: "Catch-all : tout avantage récurrent non listé ci-dessus.",
    },
  },
  en: {
    mutuellePremium: {
      label: "Health insurance",
      hint: "Employer obligation (group health plan, ≥ 50% employer-funded). Employer share in €/month. Market average: €30–60/month.",
    },
    medecineDuTravailAnnuel: {
      label: "Occupational health",
      hint: "Legal employer obligation (SST/SPSTI contribution). Annual cost per employee, market average: €80–150/year.",
    },
    transport: {
      label: "Transport (commuter pass)",
      hint: "50% of the pass = employer obligation. Paris ≈ €43/month · Lyon ≈ €32/month · elsewhere: depends on network.",
    },
    forfaitMobilite: {
      label: "Sustainable mobility package",
      hint: "Bike, carpooling, car-sharing. 2026 URSSAF cap: €800/year (≈ €67/month) exempt from payroll taxes.",
      warning: (v) => v > 67 ? "⚠ Above the URSSAF cap (€67/month). The excess is subject to payroll taxes." : null,
    },
    ticketsResto: {
      label: "Meal vouchers",
      hint: "Employer share per worked day. The employer share must be 50–60% of the voucher's face value.",
      warning: (v) => v > 7.18 ? "⚠ Above the 2026 URSSAF cap (€7.18/day). Beyond this = subject to payroll taxes." : null,
    },
    indemniteKilometriqueAnnuelle: {
      label: "Annual mileage allowance",
      hint: "Annual budget for employees using their personal vehicle (URSSAF scale based on horsepower).",
    },
    urssafIndemniteJour: {
      label: "URSSAF extended-travel allowance",
      hint: "Firm rate applied only to missions with extended travel (enabled per mission). Cap Paris/inner suburbs: €117.10/day · other zones: €97.90/day (URSSAF 2026).",
      warning: (v) => {
        if (v > 117.10) return "⚠ Above the maximum cap (€117.10/day). Beyond this = subject to payroll taxes."
        if (v > 97.90)  return "ℹ Above the cap outside Paris/inner suburbs (€97.90/day) — OK only in Paris/inner suburbs."
        return null
      },
    },
    expatriationMensuelle: {
      label: "Expatriation allowance",
      hint: "Firm rate applied only to missions abroad (enabled per mission).",
    },
    autresMensuels: {
      label: "Other monthly benefits",
      hint: "Catch-all: any recurring benefit not listed above.",
    },
  },
}

export function avantageSuffixLabel(suffix: AvantageSuffix, lang: Lang): string {
  if (lang === "fr") return suffix
  if (suffix === "€/mois") return "€/mo"
  if (suffix === "€/an") return "€/yr"
  return "€/day"
}

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
