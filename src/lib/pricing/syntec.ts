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
  /** Tickets restaurant — part employeur PAR JOUR TRAVAILLÉ (€/jour).
   *  Plafond URSSAF 2026 ≈ 7,18 €/jour pour la part exonérée employeur
   *  (60% × 11,97 € = 7,18). Le chart multiplie par les jours réels du mois. */
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
  /** Grand total — what the candidate truly costs to the ESN each month
   *  pour un nombre moyen de jours (joursFacturablesParMois). Maintenu
   *  pour compat — préférer coutFixeMensuel + coutVariableJournalier. */
  coutTotalMensuel: number
  /** Coût mensuel FIXE — brut, charges, 13e, prime vacances, prime
   *  cooptation, médecine du travail, mutuelle, transport, forfait mobilité,
   *  expatriation, indemnité km annuelle, autres mensuels. NE varie PAS
   *  avec les jours travaillés du mois. */
  coutFixeMensuel: number
  /** Coût employeur PAR JOUR TRAVAILLÉ — indemnité URSSAF grand
   *  déplacement (€/j) + tickets resto (€/j). Multiplier par les jours
   *  réellement travaillés du mois pour avoir le coût variable de ce mois. */
  coutVariableJournalier: number
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
  /** Index calendaire du mois (0=janv, 11=déc) — sert à étiqueter l'axe X. */
  calendarMonthIndex: number
  /** Effective monthly margin €, assuming rupture at this exact month.
   *  Computed as: revenu_mensuel − coût_employeur − (coût_rupture / mois).
   *  During the période d'essai, coût_rupture = 0 (no severance payable),
   *  so the curve sits at the nominal margin. After essai it drops and
   *  recovers as the rupture cost is amortised over more months. */
  margeMois: number
  /** Same margin expressed as a % of monthly revenue. */
  margePct: number
  /** Marge cumulée en € depuis le mois 1 jusqu'à ce mois inclus.
   *  Pour la courbe nominale : Σ(marge_nominale_t). Pour le worst case :
   *  Σ(marge_worst_t). Sert au 2ᵉ chart "rentabilité cumulée". */
  margeCumulee: number
}

/** Identifie quelle branche de l'arbre s'applique à un mois t donné.
 *  Sert au tooltip / annotations du graphique. */
export type RuptureBranche =
  | 'cdi_essai'              // t ≤ fin_essai
  | 'cdi_post_essai'         // t > fin_essai
  | 'cdd_essai'              // t ≤ essai_CDD
  | 'cdd_terme'              // t = durée_CDD
  | 'cdd_rupture_anticipee'  // essai_CDD < t < durée_CDD

/** 3 scénarios rupture tracés sur le chart, comme dans l'Excel de
 *  référence du sourceur :
 *  - `nominal` (« sans intercontrat ») : aucune rupture, le candidat
 *    enchaîne sur une autre mission sans temps mort
 *  - `mild` (« préavis 1 mois ») : rupture amiable post-essai, préavis
 *    négocié à 1 mois au lieu du préavis Syntec intégral
 *  - `worstCase` (« préavis max ») : rupture employeur post-essai avec
 *    préavis Syntec intégral (3 mois cadre, 2 mois ETAM…) + indemnité
 *    Art. 4.5 due selon l'ancienneté
 *
 *  Formule de chaque point (cumulative averaging, comme l'Excel) :
 *
 *    margePct(t) = ( Σ revenu_1..t  −  coût_emp × t  −  coût_rupture(t) )
 *                  ÷  Σ revenu_1..t
 *
 *  Le cumul lisse naturellement les pics et creux mensuels du calendrier
 *  (creux d'août, pic d'octobre) au lieu de les amplifier comme le faisait
 *  la formule instantanée précédente. */
export interface RuptureScenarios {
  nominal: MarginPoint[]
  mild: MarginPoint[]
  worstCase: MarginPoint[]
  /** Branche de l'arbre active à chaque mois (worst case) — annotations. */
  branches: { mois: number; branche: RuptureBranche }[]
  /** Préavis Syntec intégral applicable post-essai (mois). */
  preavisMois: number
  /** Préavis du scénario mild — fixé à 1 mois pour V1. */
  preavisMildMois: number
  /** Fin de période d'essai Syntec / Code du travail (mois). */
  finEssaiMois: number
}

/**
 * Typical French calendar profile — billable days per calendar month
 * (Syntec cadre, modalité 1). Built from working days, French fériés,
 * 25 CP/year concentrated in summer + Christmas, and ~10 RTT spread
 * across the year. Total ≈ 220 facturable days/year, scaled to match
 * the cabinet's configured monthly average. Month 1 = January for V1.
 *
 * This profile is intentionally less extreme than what unpaid leaves
 * could give (e.g. August at 10 days) so the chart ripples naturally
 * without visually colliding with the end-of-essai cliff.
 *
 * Indexed from 0 (January) to 11 (December).
 */
const TYPICAL_BILLABLE_DAYS_BY_MONTH: number[] = [
  20, // Jan
  19, // Fév
  21, // Mar
  19, // Avr — 1 férié (Pâques)
  17, // Mai — 3 fériés (1er, 8, Ascension)
  19, // Juin — 1 férié (Pentecôte), début CP
  17, // Juil — 1 semaine CP en moyenne
  14, // Août — 3 semaines CP, pic de l'été
  21, // Sep — rentrée plein temps
  22, // Oct — gros mois facturable
  18, // Nov — 2 fériés (Toussaint, Armistice)
  17, // Déc — 1 semaine CP + 1 férié (Noël)
]
const TYPICAL_YEARLY_BILLABLE = TYPICAL_BILLABLE_DAYS_BY_MONTH.reduce((a, b) => a + b, 0)

/** Returns the per-month billable-days profile for `monthCount` months,
 *  scaled so the yearly total matches configuredAvgDays × 12. The profile
 *  starts at `startMonthIndex` (0=Jan…11=Dec) so the calendar follows the
 *  actual mission start month (août = 14 j, octobre = 22 j…). */
function billableDaysProfile(
  monthCount: number,
  configuredAvgDays: number,
  startMonthIndex: number = 0,
): number[] {
  const scale = (configuredAvgDays * 12) / TYPICAL_YEARLY_BILLABLE
  const out: number[] = []
  for (let i = 0; i < monthCount; i++) {
    const monthIdx = (startMonthIndex + i) % 12
    out.push(TYPICAL_BILLABLE_DAYS_BY_MONTH[monthIdx] * scale)
  }
  return out
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

/** Taux aggregate charges patronales par STATUT social.
 *  Valeurs réalistes 2026 pour un cabinet ESN moyen (effectif 11-250 sal,
 *  Paris+ petite couronne, brut moyen 50-65k), versement mobilité inclus.
 *
 *  Décomposition Cadre Paris :
 *   - Sécu (maladie+AF+vieillesse+AT+FNAL+CSA)   ≈ 22.9%
 *   - AGIRC-ARRCO (T1+T2 effectif sur brut 60k) ≈  8.1%
 *   - CEG + CET + APEC                          ≈  1.8%
 *   - Prévoyance Syntec                         ≈  1.5%
 *   - Chômage + AGS + formation                 ≈  6.1%
 *   - Versement mobilité Paris                  ≈  3.05%
 *   - Total                                     ≈ 43-44%
 *
 *  Province : retire ~2pts de versement mobilité.
 *  ETAM : retire AGIRC-ARRCO T2, APEC, prévoyance cadre ≈ -6pts.
 *  ETAM Assimilé : entre les deux (cotise cadre mais grille ETAM).
 *  Expatrié : variable selon convention bilatérale + CFE, ~22% indicatif.
 *
 *  Ces valeurs peuvent varier de ±2pts selon : taille cabinet (>250 sal =
 *  forfait social, taxe apprentissage majorée), code AT/MP, brut exact
 *  (cotisations T2 si > PASS 4 005€/mois). Au cabinet d'ajuster si besoin. */
const TAUX_CHARGES_BY_STATUT: Record<Statut, number> = {
  etam:                  0.38,
  etam_assimile_cadre:   0.42,
  cadre:                 0.44,
}
const TAUX_CHARGES_EXPATRIE = 0.22   // utilisé via override avantages.expatriationMensuelle

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

/** Article 4.2 — durée du préavis (mois) selon statut + ancienneté.
 *  Aligné Excel cabinet (Paramètres!C95:E99) :
 *  - Cadre              → 3 mois toujours
 *  - ETAM Assimilé cadre → 2 mois toujours (même < 2 ans d'ancienneté)
 *  - ETAM coef > 355    → 2 mois toujours
 *  - ETAM < 2 ans       → 1 mois
 *  - ETAM ≥ 2 ans       → 2 mois */
function preavisMois(statut: Statut, ancienneteAnnees: number, coefficient: number): number {
  if (statut === 'cadre') return bareme.preavis_cdi.cadre.licenciement_mois
  if (statut === 'etam_assimile_cadre') {
    return (bareme.preavis_cdi as unknown as Record<string, { licenciement_mois: number }>)
      .etam_assimile_cadre.licenciement_mois
  }
  // ETAM aux coefficients 400, 450, 500 : 2 mois quel que soit l'ancienneté
  if (coefficient >= 400) {
    return bareme.preavis_cdi.etam_coef_400_450_500.licenciement_mois
  }
  if (ancienneteAnnees < 2) {
    return bareme.preavis_cdi.etam_lt_2_ans_ancienne.licenciement_mois
  }
  return bareme.preavis_cdi.etam_ge_2_ans_ancienne.licenciement_mois
}

/** Article 3.4 — total durée d'essai (initiale + renouvellement) en mois.
 *  Aligné sur la pratique cabinet (Excel pricing) :
 *  - ETAM jusqu'au coef 355  : 2 + 1 = 3 mois
 *  - ETAM coef 400 à 500     : 3 + 2 = 5 mois
 *  - Cadre (tous coefs)      : 4 + 3 = 7 mois
 *  (Le plafond légal max Syntec est 4+4=8 mois cadre mais la plupart des
 *   cabinets pratiquent 4+3=7 mois.) */
function finPeriodeEssaiMois(statut: Statut, coefficient: number): number {
  // Le JSON a été refactoré (nouvelles clés) — TS ne voit pas le nouveau
  // shape, on lit via index dynamique typé.
  const essai = (bareme.periode_essai as unknown as Record<string, { total_max_mois: number }>)
  if (statut === 'cadre') {
    return essai.cadre_tous_coefficients.total_max_mois
  }
  // ETAM (y compris assimilé cadre — la grille conventionnelle est ETAM)
  if (coefficient >= 400) {
    return essai.etam_coef_400_a_500.total_max_mois
  }
  return essai.etam_jusquau_coef_355.total_max_mois
}

/** Article 4.5 — indemnité conventionnelle de licenciement (en mois de brut).
 *  Returns 0 below 8 months of seniority (article 4.5 attribution condition).
 *  Always returns at least the legal minimum (règle "plus favorable").
 *
 *  Important : un "ETAM assimilé cadre" cotise en cadre côté retraite mais
 *  RESTE ETAM pour la grille conventionnelle Syntec (incluant l'article 4.5).
 *  Il bénéficie donc de la formule ETAM (1/4 puis 1/3 après 10 ans), pas
 *  de la formule cadre rétroactive (1/3 dès 2 ans). */
function indemniteLicenciementMois(
  statut: Statut,
  ancienneteAnnees: number,
): number {
  if (ancienneteAnnees < 8 / 12) return 0  // < 8 mois → pas d'indemnité

  // Syntec — la formule cadre rétroactive (1/3 dès 2 ans) n'est ouverte
  // qu'aux ingénieurs et cadres vrais (article 4.5 « Ingénieurs et Cadres »).
  // ETAM et assimilés cadre suivent la formule ETAM.
  let syntec: number
  if (statut === 'cadre') {
    syntec =
      ancienneteAnnees < 2
        ? ancienneteAnnees * 0.25
        : ancienneteAnnees * (1 / 3)
  } else {
    // ETAM et etam_assimile_cadre
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

  // ──────────────────────────────────────────────────────────────────────
  // Split FIXE mensuel vs VARIABLE journalier
  // ──────────────────────────────────────────────────────────────────────
  // FIXE = ne dépend pas des jours travaillés du mois
  //   - Brut + 13e + prime vacances + charges (rémunération cotisable)
  //   - Avantages mensuels constants : mutuelle, transport, forfait mobilité,
  //     expatriation, prime cooptation mensualisée, autres mensuels
  //   - Avantages annuels mensualisés : médecine du travail / 12,
  //     indemnité km annuelle / 12
  //
  // VARIABLE = se calcule par jour travaillé
  //   - Indemnité URSSAF grand déplacement (€/jour)
  //   - Tickets restaurant (€/jour, part employeur)
  //
  // Le chart MonthlyMargin appelle (coutFixe + coutVariable × jours_du_mois)
  // pour chaque mois, en utilisant les VRAIS jours travaillés du calendrier.

  // Annuel → mensuel
  const medecineDuTravailMensuelle = (input.avantages.medecineDuTravailAnnuel ?? 0) / 12
  const indemniteKmMensuelle = (input.avantages.indemniteKilometriqueAnnuelle ?? 0) / 12
  const primeCooptationMensualisee = (input.avantages.primeCooptationAnnuelle ?? 0) / 12

  // Avantages mensuels constants (hors charges, hors brut/prime/13e)
  const expatriationMensuelle = input.avantages.expatriationMensuelle ?? 0
  const avantagesMensuelsFixes =
    (input.avantages.mutuellePremium ?? 0) +
    (input.avantages.transport ?? 0) +
    (input.avantages.forfaitMobilite ?? 0) +
    medecineDuTravailMensuelle +
    indemniteKmMensuelle +
    expatriationMensuelle +
    (input.avantages.autresMensuels ?? 0)

  // Avantages JOURNALIERS — variable selon les jours travaillés du mois
  const coutVariableJournalier =
    (input.avantages.urssafIndemniteJour ?? 0) +
    (input.avantages.ticketsResto ?? 0)

  // Charges patronales sur la rémunération cotisable (brut + 13e + prime).
  // Avantages exonérés (mutuelle, transport, tickets resto, URSSAF) → pas chargés.
  // Taux par STATUT (versement mobilité inclus). Expatrié = 27% si applicable.
  const tauxCharges = input.avantages.expatriationMensuelle && input.avantages.expatriationMensuelle > 0
    ? TAUX_CHARGES_EXPATRIE
    : TAUX_CHARGES_BY_STATUT[input.statut]
  const remunerationCotisable = brutMensuel + treiziemeMoisMensualise + primeVacancesMensualisee
  const chargesPatronales = remunerationCotisable * tauxCharges

  // Coût FIXE mensuel = tout ce qui ne dépend pas des jours du mois
  const coutFixeMensuel =
    brutMensuel +
    treiziemeMoisMensualise +
    primeVacancesMensualisee +
    chargesPatronales +
    avantagesMensuelsFixes +
    primeCooptationMensualisee

  // coutTotalMensuel (legacy) : approximation basée sur jours_facturables_par_mois
  // moyen. À ne plus utiliser pour le chart — préférer coutFixe + coutVar × jours_réels.
  const coutTotalMensuel = coutFixeMensuel + coutVariableJournalier * input.joursFacturablesParMois

  // avantagesMensuels (legacy) : pour compat avec l'affichage CostBreakdown.
  // Inclut une mensualisation moyenne du variable.
  const avantagesMensuels = avantagesMensuelsFixes + coutVariableJournalier * input.joursFacturablesParMois

  return {
    brutMensuel,
    primeVacancesMensualisee,
    treiziemeMoisMensualise,
    avantagesMensuels,
    primeCooptationMensualisee,
    tauxCharges,
    chargesPatronales,
    coutTotalMensuel,
    coutFixeMensuel,
    coutVariableJournalier,
  }
}

/* ──────────────────────────────────────────────────────────────────────────
 * Public API — marge réelle de la mission (sur calendrier français)
 * ────────────────────────────────────────────────────────────────────────── */

import { missionMonthProfile } from './calendar'

export interface MissionMarginSummary {
  /** Marge mensuelle moyenne (€) sur toute la durée de la mission. */
  margeMoyenneEur: number
  /** Marge totale cumulée sur toute la mission (€). */
  margeTotaleEur: number
  /** Marge moyenne en % du revenu cumulé. */
  margePct: number
  /** Revenu mensuel moyen (€). */
  revenuMoyenEur: number
  /** Revenu total mission (€). */
  revenuTotalEur: number
  /** Coût employeur total mission (€). */
  coutTotalMission: number
  /** Nombre total de jours ouvrés sur la mission. */
  totalWorkingDays: number
  /** Nombre de mois calendaires (incluant partiels). */
  monthCount: number
}

/** Calcule la marge moyenne RÉELLE de la mission, en utilisant le calendrier
 *  français mois par mois (Lun-Ven hors fériés). C'est la valeur de
 *  référence affichée comme KPI résultante du widget pricing. */
export function computeMissionMargin(
  inputs: PricingInputs,
  tjm: number,
  startDate: Date,
  durationMonths: number,
): MissionMarginSummary {
  const cost = computeEmployerCost(inputs)
  const months = missionMonthProfile(startDate, Math.max(1, durationMonths))
  let totalRevenu = 0
  let totalCout = 0
  let totalDays = 0
  for (const m of months) {
    totalRevenu += tjm * m.workingDays
    totalCout += cost.coutFixeMensuel + cost.coutVariableJournalier * m.workingDays
    totalDays += m.workingDays
  }
  const margeTotale = totalRevenu - totalCout
  const monthCount = months.length
  return {
    margeMoyenneEur: monthCount > 0 ? margeTotale / monthCount : 0,
    margeTotaleEur: margeTotale,
    margePct: totalRevenu > 0 ? (margeTotale / totalRevenu) * 100 : 0,
    revenuMoyenEur: monthCount > 0 ? totalRevenu / monthCount : 0,
    revenuTotalEur: totalRevenu,
    coutTotalMission: totalCout,
    totalWorkingDays: totalDays,
    monthCount,
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
    /** Mois calendaire de démarrage (0=Jan…11=Déc). Par défaut : mois courant.
     *  Permet d'aligner le creux août / pic octobre avec la réalité de la mission. */
    startMonthIndex?: number
  } = { typeContrat: 'cdi' },
): RuptureScenarios {
  const cost = computeEmployerCost(input)

  // Per-month billable days profile — anchored on the mission's actual
  // start month. Revenue varies with the actual billable days of each
  // calendar month; employer cost (gross + charges + benefits) stays
  // constant. That's exactly why August is painful for ESNs : same payroll,
  // fewer billed days. The CP and RTT of the candidate are already
  // implicitly counted here : when the candidate takes 3 weeks of CP in
  // August, the month is billed 14 days but the brut + charges are paid in
  // full → ergo the August trough.
  const startMonthIndex = options.startMonthIndex ?? new Date().getMonth()
  const billableDays = billableDaysProfile(
    dureeMois,
    input.joursFacturablesParMois,
    startMonthIndex,
  )

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

  // Préavis du scénario mild (rupture amiable) — fixé à 1 mois pour V1.
  const PREAVIS_MILD_MOIS = 1

  // Rémunération totale mensuelle = brut + 13ᵉ mois prorata + prime Art. 31
  // — c'est l'assiette légale des indemnités (Syntec Art. 4.5, L1243-8).
  const remTotaleMensuelle =
    cost.brutMensuel + cost.treiziemeMoisMensualise + cost.primeVacancesMensualisee

  /** Indemnité compensatrice de congés payés non pris (L3141-28).
   *  Payée cash à la rupture pour les CP acquis mais non pris. Formule
   *  alignée Excel cabinet :  10% × coût_salarial_mensuel × (CP_restants / 2.08).
   *  - 25 CP/an / 12 mois ≈ 2.083 CP acquis par mois travaillé
   *  - Hypothèse pessimiste worst case : aucun CP pris pendant la mission,
   *    donc CP_restants = t × 2.083
   *  - L'indemnité étant un complément de salaire, elle est elle-même
   *    chargée — on prend donc le COÛT salarial (brut + charges + prime),
   *    pas le brut sec.
   *  Note : pas appliquée au scénario nominal (sans rupture) car en CDI
   *  les CP s'accumulent et se prennent, pas de paiement immédiat. */
  const coutSalarialMensuel =
    cost.brutMensuel + cost.treiziemeMoisMensualise + cost.primeVacancesMensualisee + cost.chargesPatronales
  const indemniteCompensatriceCp = (t: number): number => {
    const cpRestants = t * (25 / 12)
    return 0.10 * coutSalarialMensuel * (cpRestants / 2.08)
  }

  /** Coût rupture employeur (€) à un mois `t` donné, pour un préavis
   *  paramétrique. Utilisé pour générer les 2 courbes rupture en variant
   *  uniquement le préavis (1 mois mild vs préavis Syntec worst).
   *  Inclut l'indemnité compensatrice CP non pris (toujours due à la
   *  rupture, peu importe le motif). */
  const coutRuptureAt = (t: number, preavisMoisActif: number): { cout: number; branche: RuptureBranche } => {
    if (options.typeContrat === 'cdi') {
      if (t <= finEssai) {
        // En essai, rupture gratuite côté préavis/indemnité Art 4.5, mais
        // l'indemnité CP reste due si CP acquis non pris.
        return { cout: indemniteCompensatriceCp(t), branche: 'cdi_essai' }
      }
      const ancienneteAnnees = t / 12
      const indemniteMois = indemniteLicenciementMois(input.statut, ancienneteAnnees)
      const indemniteEuros = indemniteMois * remTotaleMensuelle
      return {
        cout: preavisMoisActif * cost.coutTotalMensuel + indemniteEuros + indemniteCompensatriceCp(t),
        branche: 'cdi_post_essai',
      }
    }
    // CDD
    const dureeCDD = options.dureeCDD ?? dureeMois
    if (t <= essaiCddMois) {
      return { cout: indemniteCompensatriceCp(t), branche: 'cdd_essai' }
    }
    if (t >= dureeCDD) {
      // Terme atteint : indemnité fin CDD 10 % de la rémunération totale.
      return {
        cout: 0.10 * remTotaleMensuelle * t + indemniteCompensatriceCp(t),
        branche: 'cdd_terme',
      }
    }
    // Rupture anticipée employeur. Le préavis paramétrique modèle ici
    // « combien de mois on continue à payer le salarié pendant que le
    // litige se règle » — pour le mild, on suppose une transaction rapide
    // (1 mois) et pour le worst case les dommages-intérêts intégraux
    // jusqu'au terme (moisRestants).
    const moisRestants = Math.min(dureeCDD - t, preavisMoisActif === PREAVIS_MILD_MOIS ? 1 : dureeCDD - t)
    const dommagesInterets = remTotaleMensuelle * moisRestants * (1 + tauxCharges)
    const indemniteFinCDD = 0.10 * remTotaleMensuelle * t
    return {
      cout: dommagesInterets + indemniteFinCDD + indemniteCompensatriceCp(t),
      branche: 'cdd_rupture_anticipee',
    }
  }

  const nominal: MarginPoint[] = []
  const mild: MarginPoint[] = []
  const worstCase: MarginPoint[] = []
  const branches: { mois: number; branche: RuptureBranche }[] = []

  // Cumulatifs glissants — clés du lissage. À chaque t, la marge affichée
  // est la moyenne sur la période [1..t] : on accumule revenu et coût
  // employeur, puis on soustrait le coût rupture (qui dépend de t).
  let cumulRevenu = 0
  let cumulCoutEmployeur = 0

  for (let t = 1; t <= dureeMois; t++) {
    const joursDuMois = billableDays[t - 1] ?? input.joursFacturablesParMois
    const calendarMonthIndex = (startMonthIndex + t - 1) % 12
    const revenuMensuel = tjm * joursDuMois

    cumulRevenu += revenuMensuel
    cumulCoutEmployeur += cost.coutTotalMensuel

    // Aide : convertit une marge € cumulée en (€/mois, %, cumul €) pour
    // un point du graphe. La moyenne mensuelle = cumul / t, le % = cumul
    // / cumulRevenu, et le cumul € reste tel quel.
    const pointFromCumul = (margeCumul: number): MarginPoint => ({
      mois: t,
      calendarMonthIndex,
      margeMois: margeCumul / t,
      margePct: cumulRevenu <= 0 ? 0 : (margeCumul / cumulRevenu) * 100,
      margeCumulee: margeCumul,
    })

    // Scénario nominal : pas de rupture, juste la marge cumulée.
    const margeNomi = cumulRevenu - cumulCoutEmployeur
    nominal.push(pointFromCumul(margeNomi))

    // Scénarios rupture : on calcule un coût rupture à cet instant t, puis
    // on retranche du cumul. La courbe est donc lisse car la volatilité
    // mensuelle a été absorbée par le cumul.
    const { cout: coutMild } = coutRuptureAt(t, PREAVIS_MILD_MOIS)
    const margeMild = cumulRevenu - cumulCoutEmployeur - coutMild
    mild.push(pointFromCumul(margeMild))

    const { cout: coutWorst, branche } = coutRuptureAt(t, preavisM)
    const margeWorst = cumulRevenu - cumulCoutEmployeur - coutWorst
    worstCase.push(pointFromCumul(margeWorst))

    branches.push({ mois: t, branche })
  }

  return {
    nominal,
    mild,
    worstCase,
    branches,
    preavisMois: preavisM,
    preavisMildMois: PREAVIS_MILD_MOIS,
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
