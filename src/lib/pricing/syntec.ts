/**
 * Naywa Pricing — Syntec calculation core (IDCC 1486, barème 2026).
 *
 * Pure library — no React, no DB calls. Consumed by:
 *   - the pricing widget on /workspace/match/[matchId]
 *   - the /workspace/parametrage page (default values)
 *   - the future /workspace/pricing standalone page
 *
 * Source of truth for numerical inputs:
 *   docs/syntec-bareme-2026.md (human notes)
 *   docs/syntec-bareme-2026.json (canonical, also mirrored here for bundler)
 *
 * The maths is deliberately written long-form (not collapsed into one big
 * expression) so a non-developer can read the file alongside the docs and
 * verify each step against the convention articles.
 *
 * Key references inside the convention Syntec 2021 (avenant n° 46) :
 *   - Article 3.4 : période d'essai par coefficient + délai de prévenance
 *   - Article 4.2 : durée du préavis CDI
 *   - Article 4.4 : indemnité compensatrice de préavis
 *   - Article 4.5 : indemnité conventionnelle de licenciement (formule plus
 *     généreuse que le légal pour les cadres : 1/3 mois/an dès 2 ans)
 *   - Article 31  : prime de vacances (10% des CP, mensualisée ≈ 1% du brut)
 */

import bareme from './syntec-bareme-2026.json'

/* ──────────────────────────────────────────────────────────────────────────
 * Public types
 * ────────────────────────────────────────────────────────────────────────── */

/** Social status — drives which cotisations apply (APEC, prévoyance 1.5%). */
export type Statut = 'etam' | 'etam_assimile_cadre' | 'cadre'

/** Syntec working-time modality. Drives min salary uplift + working hours. */
export type Modalite = 'modalite_1' | 'modalite_2' | 'modalite_3'

/** Geographic zone — drives versement mobilité + URSSAF travel allowances. */
export type Lieu = 'paris_petite_couronne' | 'idf_grande_couronne' | 'lyon' | 'province'

/** Contract type, restricted to what Syntec actually covers cleanly. */
export type TypeContrat = 'cdi' | 'cdd'

/** Optional employee perks — all monthly amounts in EUR, employer share. */
export interface Avantages {
  /** Tickets restaurant — employer's monthly contribution (€). */
  ticketsResto?: number
  /** Mutuelle premium beyond minimum legal — employer share (€/month). */
  mutuellePremium?: number
  /** Public transport reimbursement — typically 50% of Navigo/TCL (€/month). */
  transport?: number
  /** Forfait mobilité durable (vélo, covoit…) (€/month). */
  forfaitMobilite?: number
  /** 13th month bonus — if on, adds brutMensuel × 1/12 to monthly cost. */
  treiziemeMois?: boolean
  /** Coopting bonus, amortised over the mission duration (€/year). */
  primeCooptationAnnuelle?: number
  /**
   * Indemnité URSSAF grand déplacement (forfait journalier, exonéré de
   * charges). Le sourceur saisit ici le montant € par jour travaillé qu'il
   * souhaite proposer au candidat. La mensualisation se fait via
   * joursFacturablesParMois. Plafonds URSSAF 2026 par lieu :
   *   - Paris + petite couronne : 115,70 €/j (2 repas + hébergement)
   *   - Autres départements métropole : 96,50 €/j
   *   - Le calcul ignore ce plafond et fait juste la multiplication — c'est
   *     au sourceur de respecter le barème pour rester en exonération.
   */
  urssafIndemniteJour?: number
  /** Catch-all field for anything else — monthly employer cost (€). */
  autresMensuels?: number
}

/** URSSAF 2026 daily allowance ceilings per location — surfaced in UI as
 *  hints so the sourceur knows the exonération threshold for their mission. */
export const URSSAF_INDEMNITE_PLAFOND_JOUR: Record<Lieu, number> = {
  paris_petite_couronne: 115.70,
  idf_grande_couronne: 96.50,
  lyon: 96.50,
  province: 96.50,
}

/** Everything we need to compute a pricing scenario. */
export interface PricingInputs {
  /** Annual gross salary negotiated with the candidate (€). */
  brutAnnuel: number
  statut: Statut
  /** Syntec position label, e.g. "1.1", "2.3", "3.2". */
  position: string
  /** Syntec coefficient — must match position (used for prime / minimum check). */
  coefficient: number
  modalite: Modalite
  lieu: Lieu
  avantages: Avantages
  /** Average billable days per month (default 18 in this codebase). */
  joursFacturablesParMois: number
  /** Optional override of the employer-charges effective rate (0.0–1.0).
   *  When undefined, computed from the cotisations table for the given lieu. */
  tauxChargesPatronalesOverride?: number
}

/** Breakdown of the employer's monthly cost for a candidate. */
export interface EmployerCostBreakdown {
  brutMensuel: number
  /** Mensualised Article 31 vacation premium (10% of CP ≈ 1% of brut). */
  primeVacancesMensualisee: number
  /** Mensualised 13th month, when enabled (= brutMensuel / 12). */
  treiziemeMoisMensualise: number
  /** Sum of all checked employer benefits, monthly (€). */
  avantagesMensuels: number
  /** Mensualised cooptation premium (€/month). */
  primeCooptationMensualisee: number
  /** Effective employer-charge rate applied (0.0–1.0). */
  tauxCharges: number
  /** Total employer cotisations applied to brut + 13th + prime vacances. */
  chargesPatronales: number
  /** Grand total — what the candidate truly costs to the ESN each month. */
  coutTotalMensuel: number
}

/** Three KPIs the ESN sourceur reasons with. Given any 2, the 3rd is derived. */
export interface TriangleValues {
  /** Daily rate billed to the client (€ HT). */
  tjm: number
  /** Annual gross salary (€). */
  brutAnnuel: number
  /** Monthly margin (€) = revenu_mensuel − coût_employeur_mensuel. */
  margeMensuelle: number
  /** Same margin expressed in % of monthly revenue. */
  margePct: number
}

/** Single point on a margin-evolution curve. */
export interface MarginPoint {
  /** Months since mission start, 1..duration (we skip month 0). */
  mois: number
  /** Effective monthly margin €, assuming rupture at this exact month.
   *  Computed as: revenu_mensuel − coût_employeur − (coût_rupture / mois).
   *  During the période d'essai, coût_rupture = 0 (no severance payable),
   *  so the curve sits at the nominal margin. After essai it drops and
   *  recovers as the rupture cost is amortised over more months. */
  margeMois: number
  /** Same margin expressed as a % of monthly revenue. */
  margePct: number
}

/** Three rupture scenarios drawn on the chart. */
export interface RuptureScenarios {
  sansIntercontrat: MarginPoint[]
  avec1MoisIntercontrat: MarginPoint[]
  avecPreavisMax: MarginPoint[]
  /** Convention-defined notice period (months) used in scenario 3. */
  preavisMois: number
  /** End of essai period (months), for the chart's red-zone highlight. */
  finEssaiMois: number
}

/** Verdict of the conventional-minimum sanity check. */
export interface MinimumCheck {
  ok: boolean
  /** Minimum monthly gross required for this position + modality (€). */
  minimumMensuel: number
  /** What the candidate would actually get monthly (brutAnnuel / 12). */
  brutMensuelPropose: number
  /** Human-readable note when ok=false. */
  message?: string
}

/* ──────────────────────────────────────────────────────────────────────────
 * Internal helpers — read the embedded barème
 * ────────────────────────────────────────────────────────────────────────── */

/** Strongly-typed narrowing on the JSON barème's modalite_X.uplift fields. */
const MODALITE_UPLIFT_PCT: Record<Modalite, number> = {
  modalite_1: 0,
  modalite_2: 15, // Modalité 2 : forfait hebdo 38h30, +15% mini conventionnel
  modalite_3: 20, // Modalité 3 : forfait jours 218j, +20% mini conventionnel
}

/** Approximate aggregate employer-charge rate per Lieu (decimal 0.0–1.0).
 *  Computed once from the cotisations table — see _totaux_indicatifs in JSON.
 *  These are "good enough" for the V1; the paramétrage page lets the cabinet
 *  override per their actual payroll. */
const TAUX_CHARGES_BY_LIEU: Record<Lieu, number> = {
  paris_petite_couronne: 0.44,   // Versement mobilité IDF max
  idf_grande_couronne:   0.43,
  lyon:                  0.43,
  province:              0.42,
}

/** Look up the conventional minimum monthly salary for a (statut, position). */
function lookupMinimumGrid(
  statut: Statut,
  position: string,
  coefficient: number,
): number | null {
  if (statut === 'cadre' || statut === 'etam_assimile_cadre') {
    // Cadres + assimilés cadre cotisent en cadre. La grille IC s'applique
    // pour assimilés cadre quand ils sont issus du haut ETAM (coef 400+) —
    // mais le minimum reste celui d'ETAM. On distingue donc statut social
    // vs grille conventionnelle. Pour les assimilés, on retombe sur ETAM.
    if (statut === 'cadre') {
      const row = bareme.grille_cadres_2026.find(
        (r) => r.position === position && r.coefficient === coefficient,
      )
      return row ? row.minimum_mensuel_eur : null
    }
  }
  const row = bareme.grille_etam_2026.find(
    (r) => r.position === position && r.coefficient === coefficient,
  )
  return row ? row.minimum_mensuel_eur : null
}

/** Article 4.2 — durée du préavis (mois) selon statut + ancienneté. */
function preavisMois(statut: Statut, ancienneteAnnees: number, coefficient: number): number {
  if (statut === 'cadre') return bareme.preavis_cdi.cadre.licenciement_mois
  // ETAM aux coefficients 400, 450, 500 : 2 mois quel que soit l'ancienneté
  if (coefficient >= 400) {
    return bareme.preavis_cdi.etam_coef_400_450_500.licenciement_mois
  }
  if (ancienneteAnnees < 2) {
    return bareme.preavis_cdi.etam_lt_2_ans_ancienne.licenciement_mois
  }
  return bareme.preavis_cdi.etam_ge_2_ans_ancienne.licenciement_mois
}

/** Article 3.4 — total durée d'essai (initiale + renouvellement max) en mois. */
function finPeriodeEssaiMois(statut: Statut, coefficient: number): number {
  if (statut === 'cadre' || statut === 'etam_assimile_cadre') {
    if (coefficient <= 270 && coefficient >= 95) {
      return bareme.periode_essai.cadre_coef_95_a_270.total_max_mois
    }
  }
  if (coefficient >= 275) {
    return bareme.periode_essai.etam_coef_275_a_500.total_max_mois
  }
  return bareme.periode_essai.etam_coef_240_a_250.total_max_mois
}

/** Article 4.5 — indemnité conventionnelle de licenciement (en mois de brut).
 *  Returns 0 below 8 months of seniority (article 4.5 attribution condition).
 *  Always returns at least the legal minimum (règle "plus favorable"). */
function indemniteLicenciementMois(
  statut: Statut,
  ancienneteAnnees: number,
): number {
  if (ancienneteAnnees < 8 / 12) return 0  // < 8 mois → pas d'indemnité

  // Syntec
  let syntec: number
  if (statut === 'cadre' || statut === 'etam_assimile_cadre') {
    syntec =
      ancienneteAnnees < 2
        ? ancienneteAnnees * 0.25
        : ancienneteAnnees * (1 / 3)
  } else {
    syntec =
      ancienneteAnnees <= 10
        ? ancienneteAnnees * 0.25
        : 10 * 0.25 + (ancienneteAnnees - 10) * (1 / 3)
  }

  // Légal (R1234-2)
  const legal =
    ancienneteAnnees <= 10
      ? ancienneteAnnees * 0.25
      : 10 * 0.25 + (ancienneteAnnees - 10) * (1 / 3)

  return Math.max(syntec, legal)
}

/* ──────────────────────────────────────────────────────────────────────────
 * Public API — employer cost
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * Compute the full monthly employer cost of a candidate.
 *
 * The result is mensualised: even one-shot annual items (cooptation,
 * 13th month, prime de vacances) are smoothed over 12 months so the
 * monthly margin is comparable across scenarios.
 */
export function computeEmployerCost(input: PricingInputs): EmployerCostBreakdown {
  const brutMensuel = input.brutAnnuel / 12

  // Article 31 — prime de vacances : 10% des CP, et les CP représentent
  // ≈ 1/12 du brut annuel (règle des 1/10ème).
  // → Prime annuelle ≈ 1% du brut annuel. Mensualisée : ≈ brutMensuel × 0.01.
  const primeVacancesMensualisee = brutMensuel * 0.01

  const treiziemeMoisMensualise = input.avantages.treiziemeMois ? brutMensuel / 12 : 0

  // URSSAF indemnité = montant journalier × jours facturables ; reste exonéré
  // de charges (c'est l'intérêt URSSAF), donc on l'agrège aux avantages plutôt
  // qu'à la rémunération cotisable.
  const urssafIndemniteMensuelle =
    (input.avantages.urssafIndemniteJour ?? 0) * input.joursFacturablesParMois

  const avantagesMensuels =
    (input.avantages.ticketsResto ?? 0) +
    (input.avantages.mutuellePremium ?? 0) +
    (input.avantages.transport ?? 0) +
    (input.avantages.forfaitMobilite ?? 0) +
    urssafIndemniteMensuelle +
    (input.avantages.autresMensuels ?? 0)

  const primeCooptationMensualisee = (input.avantages.primeCooptationAnnuelle ?? 0) / 12

  // Employer charges apply to brut + 13th + prime de vacances (everything
  // that's part of the contractual remuneration). Avantages en nature
  // (tickets resto, mutuelle, transport) are partially exonérés so we don't
  // apply charges on top — they're already net cost to the employer.
  const tauxCharges = input.tauxChargesPatronalesOverride ?? TAUX_CHARGES_BY_LIEU[input.lieu]
  const remunerationCotisable = brutMensuel + treiziemeMoisMensualise + primeVacancesMensualisee
  const chargesPatronales = remunerationCotisable * tauxCharges

  const coutTotalMensuel =
    brutMensuel +
    treiziemeMoisMensualise +
    primeVacancesMensualisee +
    chargesPatronales +
    avantagesMensuels +
    primeCooptationMensualisee

  return {
    brutMensuel,
    primeVacancesMensualisee,
    treiziemeMoisMensualise,
    avantagesMensuels,
    primeCooptationMensualisee,
    tauxCharges,
    chargesPatronales,
    coutTotalMensuel,
  }
}

/* ──────────────────────────────────────────────────────────────────────────
 * Public API — the triangle (TJM / brut / marge)
 * ────────────────────────────────────────────────────────────────────────── */

/** Pin two of the three KPIs and ask for the third. The two non-pinned
 *  values in `known` are ignored. */
export type TrianglePivot = 'tjm' | 'brut' | 'marge'

/**
 * Compute the full triangle of values given any two pins.
 *
 * Internally:
 *   revenu_mensuel  = TJM × joursFacturablesParMois
 *   coût_employeur  = computeEmployerCost(inputs).coutTotalMensuel
 *   marge_mensuelle = revenu_mensuel − coût_employeur
 *
 * Picking a `pivot` tells the function which of TJM / brut / marge it must
 * SOLVE for; the other two fields of `known` are taken as inputs.
 */
export function computeTriangle(
  pivot: TrianglePivot,
  known: Partial<TriangleValues>,
  baseInputs: Omit<PricingInputs, 'brutAnnuel'> & { brutAnnuel?: number },
): TriangleValues {
  const j = baseInputs.joursFacturablesParMois

  if (pivot === 'marge') {
    // Need: brut + TJM → derive marge
    const brutAnnuel = mustHaveNumber(known.brutAnnuel, 'brutAnnuel')
    const tjm = mustHaveNumber(known.tjm, 'tjm')
    const cost = computeEmployerCost({ ...baseInputs, brutAnnuel })
    const revenu = tjm * j
    const margeMensuelle = revenu - cost.coutTotalMensuel
    const margePct = revenu === 0 ? 0 : (margeMensuelle / revenu) * 100
    return { tjm, brutAnnuel, margeMensuelle, margePct }
  }

  if (pivot === 'tjm') {
    // Need: brut + marge → derive TJM such that revenu − cost = marge
    const brutAnnuel = mustHaveNumber(known.brutAnnuel, 'brutAnnuel')
    const margeMensuelle = mustHaveNumber(known.margeMensuelle, 'margeMensuelle')
    const cost = computeEmployerCost({ ...baseInputs, brutAnnuel })
    const tjm = (cost.coutTotalMensuel + margeMensuelle) / j
    const revenu = tjm * j
    const margePct = revenu === 0 ? 0 : (margeMensuelle / revenu) * 100
    return { tjm, brutAnnuel, margeMensuelle, margePct }
  }

  // pivot === 'brut' — Need: TJM + marge → derive brut
  // We invert the affine relation: coutTotal(brut) = α·brut + β
  // (α captures rate-multipliers, β captures avantages and cooptation).
  // Then: brut = (revenu − marge − β) / α   ·  ×12 for annual.
  const tjm = mustHaveNumber(known.tjm, 'tjm')
  const margeMensuelle = mustHaveNumber(known.margeMensuelle, 'margeMensuelle')
  const revenu = tjm * j

  // Probe the cost function at two brut values to recover the affine form.
  const probe = computeEmployerCost({ ...baseInputs, brutAnnuel: 12000 })
  const probe2 = computeEmployerCost({ ...baseInputs, brutAnnuel: 24000 })
  const alpha = (probe2.coutTotalMensuel - probe.coutTotalMensuel) / (24000 / 12 - 12000 / 12)
  const beta = probe.coutTotalMensuel - alpha * (12000 / 12)

  const brutMensuel = (revenu - margeMensuelle - beta) / alpha
  const brutAnnuel = Math.max(0, brutMensuel * 12)
  const margePct = revenu === 0 ? 0 : (margeMensuelle / revenu) * 100
  return { tjm, brutAnnuel, margeMensuelle, margePct }
}

function mustHaveNumber(v: number | undefined, name: string): number {
  if (v === undefined || Number.isNaN(v)) {
    throw new Error(`computeTriangle: pivot needs known.${name}`)
  }
  return v
}

/* ──────────────────────────────────────────────────────────────────────────
 * Public API — rupture scenarios for the margin chart
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * Compute the three margin-vs-time curves displayed on the fiche match chart.
 *
 * For each month t in [1..dureeMois], we report the EFFECTIVE monthly
 * margin assuming the contract would be ruptured exactly at month t :
 *
 *     marge_mensuelle_effective(t) = revenu_mensuel − coût_employeur
 *                                    − ( coût_rupture(t) / t )
 *
 * Critically, `coût_rupture(t)` is ZERO while we are still within the
 * période d'essai (the Syntec préavis and the Article 4.5 indemnity only
 * become payable AFTER essai). That's why the curves stay at the nominal
 * margin during the first months, then PLUNGE the moment the essai ends
 * (every euro of préavis + severance suddenly enters the cost), then
 * recover progressively as that fixed rupture cost is amortised over an
 * ever-growing t.
 *
 * Scenario 1 — sans intercontrat  : coût_rupture(t) = 0 always (rupture
 *   amiable, candidate immediately placed elsewhere). Curve is a flat
 *   plateau at the nominal margin.
 * Scenario 2 — +1 mois intercontrat : coût_rupture(t) = coût × 1 (one
 *   paid idle month) once t > finEssai, 0 otherwise.
 * Scenario 3 — préavis Syntec : coût_rupture(t) = coût × préavis +
 *   indemnité_licenciement(t) once t > finEssai, 0 otherwise.
 *
 * The candidate is assumed to be billable from day 1 — we never start
 * with a negative margin during essai, only after.
 */
export function computeRuptureScenarios(
  input: PricingInputs,
  dureeMois: number,
  tjm: number,
): RuptureScenarios {
  const cost = computeEmployerCost(input)
  const revenuMensuel = tjm * input.joursFacturablesParMois
  const margeNominaleMensuelle = revenuMensuel - cost.coutTotalMensuel
  const brutMensuel = input.brutAnnuel / 12

  const preavisM = preavisMois(input.statut, dureeMois / 12, input.coefficient)
  const finEssai = finPeriodeEssaiMois(input.statut, input.coefficient)

  const sansIntercontrat: MarginPoint[] = []
  const avec1Mois: MarginPoint[] = []
  const avecPreavis: MarginPoint[] = []

  const pctOf = (m: number): number =>
    revenuMensuel <= 0 ? 0 : (m / revenuMensuel) * 100

  for (let t = 1; t <= dureeMois; t++) {
    const inEssai = t <= finEssai
    const ancienneteAnnees = t / 12

    // 1) Sans intercontrat — flat plateau, the candidate moves on instantly,
    //    no rupture cost ever lands on the ESN.
    sansIntercontrat.push({
      mois: t,
      margeMois: margeNominaleMensuelle,
      margePct: pctOf(margeNominaleMensuelle),
    })

    // 2) +1 mois intercontrat — applies only after essai. During essai,
    //    rupture is costless so the margin sits at the nominal level.
    const cost1m = inEssai ? 0 : (cost.coutTotalMensuel * 1) / t
    const marge1m = margeNominaleMensuelle - cost1m
    avec1Mois.push({
      mois: t,
      margeMois: marge1m,
      margePct: pctOf(marge1m),
    })

    // 3) Préavis Syntec — préavis non facturé + indemnité Article 4.5
    //    amortised over t. Only kicks in once essai is over.
    let costPreavis = 0
    if (!inEssai) {
      const indemniteMois = indemniteLicenciementMois(input.statut, ancienneteAnnees)
      const indemniteEuros = indemniteMois * brutMensuel
      costPreavis = (preavisM * cost.coutTotalMensuel + indemniteEuros) / t
    }
    const margePreavis = margeNominaleMensuelle - costPreavis
    avecPreavis.push({
      mois: t,
      margeMois: margePreavis,
      margePct: pctOf(margePreavis),
    })
  }

  return {
    sansIntercontrat,
    avec1MoisIntercontrat: avec1Mois,
    avecPreavisMax: avecPreavis,
    preavisMois: preavisM,
    finEssaiMois: finEssai,
  }
}

/* ──────────────────────────────────────────────────────────────────────────
 * Public API — conventional-minimum sanity check
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * Verify that the proposed gross salary clears the conventional minimum
 * for the candidate's (statut, position, coefficient, modalité). Modalités
 * 2 and 3 require an uplift of 15% / 20% respectively on the grid minimum.
 */
export function validateAgainstMinimum(input: PricingInputs): MinimumCheck {
  const minBrut = lookupMinimumGrid(input.statut, input.position, input.coefficient)
  if (minBrut === null) {
    return {
      ok: true,
      minimumMensuel: 0,
      brutMensuelPropose: input.brutAnnuel / 12,
      message: `Position ${input.position} (coef ${input.coefficient}) introuvable dans la grille — vérifier la saisie.`,
    }
  }

  const uplift = 1 + MODALITE_UPLIFT_PCT[input.modalite] / 100
  const minimumMensuel = minBrut * uplift
  const brutMensuelPropose = input.brutAnnuel / 12

  if (brutMensuelPropose < minimumMensuel) {
    const ecart = minimumMensuel - brutMensuelPropose
    return {
      ok: false,
      minimumMensuel,
      brutMensuelPropose,
      message: `Brut proposé ${formatEur(brutMensuelPropose)} sous le minimum conventionnel ${formatEur(
        minimumMensuel,
      )} (manque ${formatEur(ecart)}).`,
    }
  }

  return { ok: true, minimumMensuel, brutMensuelPropose }
}

/* ──────────────────────────────────────────────────────────────────────────
 * Misc — formatting helper
 * ────────────────────────────────────────────────────────────────────────── */

function formatEur(n: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(n)
}

/* ──────────────────────────────────────────────────────────────────────────
 * Public re-exports of the barème — for the paramétrage UI to display them
 * ────────────────────────────────────────────────────────────────────────── */

export const SYNTEC_BAREME = bareme
export const SYNTEC_STATUTS: Statut[] = ['etam', 'etam_assimile_cadre', 'cadre']
export const SYNTEC_MODALITES: Modalite[] = ['modalite_1', 'modalite_2', 'modalite_3']
export const SYNTEC_LIEUX: Lieu[] = [
  'paris_petite_couronne',
  'idf_grande_couronne',
  'lyon',
  'province',
]
