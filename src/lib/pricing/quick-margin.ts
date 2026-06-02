/**
 * computeQuickMargin — calcul rapide de marge pour la liste candidats.
 *
 * Mêmes fonctions calcul que dans le widget pricing, sans le wrapping React.
 * Utilisé côté serveur ou côté client (pure fonction). Renvoie la marge
 * moyenne mission en pourcentage et en €/mois + le brut/tjm utilisés.
 *
 * AUCUNE formule métier n'est ajoutée : on s'appuie strictement sur
 * computeMissionMargin de syntec.ts. Si la mission n'est pas paramétrée
 * (pas de start_date ou de durée), on renvoie null.
 */

import {
  computeMissionMargin,
  type Avantages,
  type Lieu,
  type PricingInputs,
} from "@/lib/pricing/syntec"
import type { Candidate, Job, Profile } from "@/lib/database.types"
import { PRESETS, detectSeniority } from "@/lib/pricing/preset"

const FALLBACK_AVANTAGES: Avantages = {
  ticketsResto: 6,
  mutuellePremium: 45,
  transport: 42,
  forfaitMobilite: 0,
  treiziemeMois: false,
  primeCooptationAnnuelle: 0,
  autresMensuels: 0,
}

export interface QuickMarginResult {
  margePct: number
  margeMensuelleEur: number
  tjm: number
  brut: number
}

export function computeQuickMargin(args: {
  candidate: Candidate
  job: Job | null
  profile: Pick<Profile,
    | "pricing_billable_days_per_month"
    | "pricing_rtt_days_per_year"
    | "pricing_default_lieu"
    | "pricing_default_avantages"
  > | null
  /** Si null/undefined : on retombe sur job.client_tjm_min puis défaut. */
  persistedTjm: number | null
  persistedBrut: number | null
}): QuickMarginResult | null {
  const { candidate, job, profile, persistedTjm, persistedBrut } = args
  if (!job?.start_date || !job.duration_months) return null

  const preset = PRESETS[detectSeniority(candidate.parsed_cv, candidate.current_title)]

  // Lieu : priorité au lieu typé mission, fallback cabinet, fallback Paris.
  const lieu: Lieu = (job.pricing_lieu as Lieu | null)
    ?? (profile?.pricing_default_lieu as Lieu | undefined)
    ?? "paris_petite_couronne"

  // Avantages : base cabinet, on neutralise les tarifs conditionnels que la
  // mission n'active pas (grand déplacement, expatriation).
  const baseAv: Avantages = {
    ...FALLBACK_AVANTAGES,
    ...(profile?.pricing_default_avantages ?? {}),
  }
  if (!job.has_grand_deplacement) baseAv.urssafIndemniteJour = 0
  if (!job.is_expatriated)        baseAv.expatriationMensuelle = 0

  const tjm = persistedTjm ?? job.client_tjm_min ?? job.client_tjm_max ?? 550
  const brut = persistedBrut ?? job.target_gross_salary ?? 45000

  const inputs: PricingInputs = {
    brutAnnuel: brut,
    statut: preset.statut,
    position: preset.position,
    coefficient: preset.coefficient,
    modalite: preset.modalite,
    lieu,
    avantages: baseAv,
    joursFacturablesParMois: profile?.pricing_billable_days_per_month ?? 21,
    rttDaysPerYear: profile?.pricing_rtt_days_per_year ?? 0,
  }

  try {
    const startDate = new Date(job.start_date)
    if (Number.isNaN(startDate.getTime())) return null
    const summary = computeMissionMargin(inputs, tjm, startDate, job.duration_months)
    return {
      margePct: summary.margePct,
      margeMensuelleEur: summary.margeMoyenneEur,
      tjm,
      brut,
    }
  } catch {
    return null
  }
}
