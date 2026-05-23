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
   *   - Paris + petite couronne : 117,10 €/j (2 repas 21,40 + hébergement 74,30)
   *   - Autres départements métropole : 97,90 €/j (2 repas + 55,10)
   *   - Le calcul ignore ce plafond et fait juste la multiplication — c'est
   *     au sourceur de respecter le barème pour rester en exonération.
   */
  urssafIndemniteJour?: number
  /**
   * Médecine du travail — cotisation obligatoire à un Service de Santé au
   * Travail (SST/AIST). Forfait annuel, mensualisé (forfait / 12). Coût
   * typique 80-150 €/an/salarié. Pas exonéré de charges (forfait fixe).
   */
  medecineDuTravailAnnuel?: number
  /**
   * Indemnité kilométrique annuelle estimée — si le candidat utilise son
   * véhicule personnel pour des déplacements pro (rare en ESN sur site
   * client, mais ponctuel). Mensualisé (annuel / 12). Exonéré de charges
   * tant que le barème URSSAF est respecté (voir sidebar Pricing).
   */
  indemniteKilometriqueAnnuelle?: number
  /**
   * Mission expatrié — coût mensuel supplémentaire spécifique : indemnité
   * d'expatriation versée au candidat (cotise selon régime), pas exonéré
   * de charges. À renseigner par mission. Note V1 : calcul simplifié,
   * vérifier avec un expert paie pour les conventions bilatérales et
   * la Caisse des Français de l'Étranger (CFE).
   */
  expatriationMensuelle?: number
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
  /** @deprecated Le taux est fixé par la loi (par statut), pas par
   *  l'employeur. Champ conservé pour ne pas casser les callsites
   *  historiques, mais ignoré dans le nouveau code. À retirer dans une
   *  version future. */
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

/** Identifie quelle branche de l'arbre s'applique à un mois t donné.
 *  Sert au tooltip / annotations du graphique. */
export type RuptureBranche =
  | 'cdi_essai'              // t ≤ fin_essai
  | 'cdi_post_essai'         // t > fin_essai
  | 'cdd_essai'              // t ≤ essai_CDD
  | 'cdd_terme'              // t = durée_CDD
  | 'cdd_rupture_anticipee'  // essai_CDD < t < durée_CDD

/** Worst-case rupture curves drawn on the chart.
 *  - `nominal` : plateau plat de la marge mensuelle sans aucune rupture
 *  - `worstCase` : marge mensuelle effective si l'employeur subit la
 *    rupture à chaque t (pendant essai = nominale, post-essai = chute
 *    cliff puis remontée asymptotique). */
export interface RuptureScenarios {
  nominal: MarginPoint[]
  worstCase: MarginPoint[]
  /** Branche de l'arbre active à chaque mois — pour annotations / tooltips. */
  branches: { mois: number; branche: RuptureBranche }[]
  /** Préavis Syntec applicable post-essai (mois). */
  preavisMois: number
  /** Fin de période d'essai Syntec / Code du travail (mois). */
  finEssaiMois: number
}

// NOTE — a calendar-aware billable-days profile (August dips for CP, May
// fériés, October peaks…) was prototyped here but removed in favor of a
// constant value, because the dips collided with the end-of-essai cliff
// and made the chart confusing. The risk indicators expose the actionable
// numbers separately. If we want a calendar view back later, it'll come
// as an opt-in toggle that uses a real mission start date — see RiskPanel
// in PricingWidget.tsx for the synthesis side of the equation.

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

  // Médecine du travail — forfait annuel obligatoire, mensualisé.
  const medecineDuTravailMensuelle = (input.avantages.medecineDuTravailAnnuel ?? 0) / 12

  // Indemnité kilométrique — annuelle estimée, mensualisée.
  const indemniteKmMensuelle = (input.avantages.indemniteKilometriqueAnnuelle ?? 0) / 12

  // Expatriation — montant mensuel direct.
  const expatriationMensuelle = input.avantages.expatriationMensuelle ?? 0

  const avantagesMensuels =
    (input.avantages.ticketsResto ?? 0) +
    (input.avantages.mutuellePremium ?? 0) +
    (input.avantages.transport ?? 0) +
    (input.avantages.forfaitMobilite ?? 0) +
    urssafIndemniteMensuelle +
    medecineDuTravailMensuelle +
    indemniteKmMensuelle +
    expatriationMensuelle +
    (input.avantages.autresMensuels ?? 0)

  const primeCooptationMensualisee = (input.avantages.primeCooptationAnnuelle ?? 0) / 12

  // Employer charges apply to brut + 13th + prime de vacances (everything
  // that's part of the contractual remuneration). Avantages en nature
  // (tickets resto, mutuelle, transport) are partially exonérés so we don't
  // apply charges on top — they're already net cost to the employer.
  // Le taux est fixé par la loi (statut + lieu pour le versement mobilité),
  // pas par l'employeur. L'ancien override est ignoré dans le nouveau code.
  const tauxCharges = TAUX_CHARGES_BY_LIEU[input.lieu]
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
 * Compute the rupture scenarios for the margin chart.
 *
 * Implémente l'arbre décisionnel validé avec le sourceur :
 *
 *   1. Type de contrat ?
 *      ├── CDI
 *      │   2. t ≤ fin_essai(coef) ?
 *      │     ├── OUI → coût_total(t) = C × t                         (cdi_essai)
 *      │     └── NON → coût_total(t) = C × t + préavis × C
 *      │              + indemnité_4.5(statut, t)                    (cdi_post_essai)
 *      │
 *      └── CDD
 *          2. t ≤ essai_CDD(durée) ?
 *            ├── OUI → coût_total(t) = C × t                         (cdd_essai)
 *            └── NON
 *                3. t = durée_CDD ?
 *                  ├── OUI → coût_total(t) = C × t + 0,10 × Brut × t (cdd_terme)
 *                  └── NON → coût_total(t) = C × t
 *                            + Brut × (durée − t) × (1 + charges)
 *                            + 0,10 × Brut × t              (cdd_rupture_anticipee)
 *
 * Postulats :
 *   - Rupture toujours initiée par l'employeur (seul cas qui impacte sa marge).
 *   - Préavis toujours respecté (l'employeur n'a pas intérêt à le dispenser
 *     et payer l'indemnité compensatrice en plus).
 *   - Cas exclus : démission, rupture conventionnelle, faute grave, inaptitude,
 *     force majeure (cf. arbre dans la page Pricing).
 *
 * Sortie : 2 courbes
 *   - nominal   : plateau plat à la marge nominale (sans aucune rupture)
 *   - worstCase : marge mensuelle effective si rupture employeur à chaque t
 *                 = (revenu × t − coût_total(t)) ÷ t
 */
export function computeRuptureScenarios(
  input: PricingInputs,
  dureeMois: number,
  tjm: number,
  options: {
    typeContrat: TypeContrat
    /** Durée prévue du CDD en mois — requise si typeContrat === 'cdd'. */
    dureeCDD?: number
  } = { typeContrat: 'cdi' },
): RuptureScenarios {
  const cost = computeEmployerCost(input)
  const brutMensuel = input.brutAnnuel / 12

  const revenuMensuel = tjm * input.joursFacturablesParMois
  const margeNominaleMensuelle = revenuMensuel - cost.coutTotalMensuel

  // Taux charges patronales effectif — sert au calcul des dommages-intérêts
  // CDD (salaires restants × (1 + charges)).
  const tauxCharges = cost.brutMensuel > 0
    ? cost.chargesPatronales / cost.brutMensuel
    : 0.43

  const preavisM = preavisMois(input.statut, dureeMois / 12, input.coefficient)
  const finEssai = finPeriodeEssaiMois(input.statut, input.coefficient)

  // Période d'essai CDD — Code du travail L1242-10 : 1 jour ouvré par
  // semaine de contrat, plafonné à 2 semaines (CDD ≤ 6 mois) ou 1 mois
  // (CDD > 6 mois). Convertie en mois pour le seuil de notre arbre.
  const essaiCddMois = options.typeContrat === 'cdd' && options.dureeCDD
    ? options.dureeCDD <= 6 ? 0.5 : 1.0
    : 0

  const pctOf = (m: number): number =>
    revenuMensuel <= 0 ? 0 : (m / revenuMensuel) * 100

  const nominal: MarginPoint[] = []
  const worstCase: MarginPoint[] = []
  const branches: { mois: number; branche: RuptureBranche }[] = []

  for (let t = 1; t <= dureeMois; t++) {
    // Nominal — toujours la marge constante, c'est le repère visuel.
    nominal.push({
      mois: t,
      margeMois: margeNominaleMensuelle,
      margePct: pctOf(margeNominaleMensuelle),
    })

    // Worst-case : on parcourt l'arbre selon (typeContrat, t).
    let coutRupture = 0
    let branche: RuptureBranche = 'cdi_essai'

    if (options.typeContrat === 'cdi') {
      if (t <= finEssai) {
        // Branche cdi_essai : aucun coût de rupture.
        branche = 'cdi_essai'
        coutRupture = 0
      } else {
        // Branche cdi_post_essai : préavis × coût + indemnité Art. 4.5.
        branche = 'cdi_post_essai'
        const ancienneteAnnees = t / 12
        const indemniteMois = indemniteLicenciementMois(input.statut, ancienneteAnnees)
        const indemniteEuros = indemniteMois * brutMensuel
        coutRupture = preavisM * cost.coutTotalMensuel + indemniteEuros
      }
    } else {
      // CDD — 3 branches selon t vs essai_CDD vs durée_CDD.
      const dureeCDD = options.dureeCDD ?? dureeMois
      if (t <= essaiCddMois) {
        branche = 'cdd_essai'
        coutRupture = 0
      } else if (t >= dureeCDD) {
        // Atteint le terme : indemnité fin CDD 10 % de la rémunération totale.
        branche = 'cdd_terme'
        coutRupture = 0.10 * brutMensuel * t
      } else {
        // Rupture anticipée par l'employeur (worst case du CDD).
        branche = 'cdd_rupture_anticipee'
        const moisRestants = dureeCDD - t
        const dommagesInterets = brutMensuel * moisRestants * (1 + tauxCharges)
        const indemniteFinCDD = 0.10 * brutMensuel * t
        coutRupture = dommagesInterets + indemniteFinCDD
      }
    }

    // Mensualisation : on étale le coût de rupture sur t mois écoulés.
    const margeWorst = margeNominaleMensuelle - coutRupture / t
    worstCase.push({
      mois: t,
      margeMois: margeWorst,
      margePct: pctOf(margeWorst),
    })
    branches.push({ mois: t, branche })
  }

  return {
    nominal,
    worstCase,
    branches,
    preavisMois: preavisM,
    finEssaiMois: finEssai,
  }
}

/* ──────────────────────────────────────────────────────────────────────────
 * Risk indicators — the actionable side of the chart
 * ────────────────────────────────────────────────────────────────────────── */

/** A score for "how risky is it to hire this profile given the rupture
 *  exposure ?" — derived from the worst-case scenario (préavis max). */
export type RiskLevel = 'low' | 'medium' | 'high'

export interface RiskIndicators {
  /** Pire marge mensuelle sur l'horizon en € (worst-case scenario). */
  margeMinMensuelle: number
  /** Idem en % du revenu mensuel. */
  margeMinPct: number
  /** Mois où cette marge minimale se produit (1..24). */
  moisCritique: number
  /** Premier mois où le worst-case repasse au-dessus du seuil de marge
   *  minimum du cabinet. NULL si jamais atteint sur l'horizon. */
  breakEvenMois: number | null
  /** Marge cumulative perdue (cumul des marges sous le seuil sur les
   *  premiers mois post-essai) — c'est le coût total "à essuyer". */
  coutRupturePire: number
  /** Niveau de risque global. */
  level: RiskLevel
  /** Phrase explicative à afficher à côté du badge. */
  message: string
}

/**
 * Synthétise la courbe worst-case en 4 indicateurs actionnables pour
 * décider. La nouvelle structure expose directement `worstCase` (rupture
 * employeur), ce qui correspond exactement à ce qu'on veut analyser.
 */
export function computeRiskIndicators(
  scenarios: RuptureScenarios,
  margeMinPct: number,
  revenuMensuel: number,
): RiskIndicators {
  const worst = scenarios.worstCase
  if (worst.length === 0) {
    return {
      margeMinMensuelle: 0,
      margeMinPct: 0,
      moisCritique: 0,
      breakEvenMois: null,
      coutRupturePire: 0,
      level: 'low',
      message: 'Aucune donnée disponible.',
    }
  }
  const seuilMinEuros = revenuMensuel * (margeMinPct / 100)

  // Pire point sur la courbe préavis max
  let worstPoint = worst[0]
  for (const p of worst) {
    if (p.margeMois < worstPoint.margeMois) worstPoint = p
  }

  // Premier mois post-cliff où on revient au-dessus du seuil mini
  const finEssai = scenarios.finEssaiMois
  let breakEvenMois: number | null = null
  for (const p of worst) {
    if (p.mois <= finEssai) continue // ignore le plateau d'essai
    if (p.margeMois >= seuilMinEuros) { breakEvenMois = p.mois; break }
  }

  // Coût total à essuyer = somme des écarts négatifs (sous seuil) après cliff
  let coutRupture = 0
  for (const p of worst) {
    if (p.mois <= finEssai) continue
    const ecart = seuilMinEuros - p.margeMois
    if (ecart > 0) coutRupture += ecart
  }

  // Score
  let level: RiskLevel = 'low'
  let message = ''
  const margeMinNeg = worstPoint.margeMois < 0
  if (margeMinNeg || breakEvenMois === null) {
    level = 'high'
    message = breakEvenMois === null
      ? `Le worst-case ne repasse jamais au-dessus du seuil (${margeMinPct}%) sur 24 mois.`
      : `Marge négative au pire mois — mission très risquée.`
  } else if (worstPoint.margePct < margeMinPct || (breakEvenMois ?? 0) > 12) {
    level = 'medium'
    message = `Marge sous le seuil ${margeMinPct}% pendant ~${breakEvenMois! - finEssai} mois après l'essai.`
  } else {
    level = 'low'
    message = `Worst-case reste au-dessus du seuil dès le mois ${breakEvenMois}, risque maîtrisé.`
  }

  return {
    margeMinMensuelle: worstPoint.margeMois,
    margeMinPct: worstPoint.margePct,
    moisCritique: worstPoint.mois,
    breakEvenMois,
    coutRupturePire: coutRupture,
    level,
    message,
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
