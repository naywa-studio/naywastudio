/* eslint-disable no-console */
/**
 * Pricing — smoke tests des fonctions de calcul critiques.
 *
 * Exécution :  npx tsx scripts/test-pricing.ts
 *
 * Pas de framework de test (Jest, Vitest) installé pour ne pas alourdir
 * le projet. Ce script est exécutable à la demande pour vérifier que les
 * formules de syntec.ts n'ont pas régressé après une modif. Quand on aura
 * vraiment besoin (CI), on installera vitest et on convertira.
 *
 * Chaque cas vérifie un ensemble de valeurs attendues à ±tolérance.
 * Sortie : nombre de cas PASS / FAIL + détails des échecs.
 */

import {
  computeEmployerCost,
  computeMissionMargin,
  computeRuptureRiskProfile,
  validateAgainstMinimum,
  type PricingInputs,
} from '../src/lib/pricing/syntec'
import { workingDaysInRange, missionMonthProfile } from '../src/lib/pricing/calendar'

let passed = 0
let failed = 0
const failures: string[] = []

function approx(actual: number, expected: number, tolerance: number, label: string): void {
  const ok = Math.abs(actual - expected) <= tolerance
  if (ok) {
    passed++
  } else {
    failed++
    failures.push(`  ❌ ${label}\n    attendu : ${expected} (±${tolerance})\n    reçu    : ${actual}`)
  }
}

function eq<T>(actual: T, expected: T, label: string): void {
  const ok = actual === expected
  if (ok) {
    passed++
  } else {
    failed++
    failures.push(`  ❌ ${label}\n    attendu : ${expected}\n    reçu    : ${actual}`)
  }
}

function section(name: string): void {
  console.log(`\n━━━ ${name} ━━━`)
}

/* ──────────────────────────────────────────────────────────────────────────
 * Inputs de référence
 * ────────────────────────────────────────────────────────────────────────── */

const REF_CADRE: PricingInputs = {
  brutAnnuel: 45000,
  statut: 'cadre',
  position: '2.2',
  coefficient: 130,
  modalite: 'modalite_3',
  lieu: 'paris_petite_couronne',
  avantages: {
    ticketsResto: 6,
    mutuellePremium: 50,
    transport: 42,
    medecineDuTravailAnnuel: 100,
    urssafIndemniteJour: 96,
  },
  joursFacturablesParMois: 21,
}

/* ──────────────────────────────────────────────────────────────────────────
 * Test 1 — Coût employeur Cadre Paris brut 45k
 * ────────────────────────────────────────────────────────────────────────── */
section('computeEmployerCost — Cadre Paris brut 45k')

{
  const cost = computeEmployerCost(REF_CADRE)
  approx(cost.brutMensuel, 3750, 0.01, 'brut mensuel = 45000/12')
  approx(cost.primeVacancesMensualisee, 37.5, 0.01, 'prime vacances = 1% brut mensuel')
  approx(cost.treiziemeMoisMensualise, 0, 0.01, '13e mois = 0 (non activé)')
  approx(cost.tauxCharges, 0.44, 0.001, 'taux charges cadre = 44%')
  // charges = (3750 + 37.5) × 0.44 = 1666.5
  approx(cost.chargesPatronales, 1666.5, 0.5, 'charges patronales sur assiette')
  // fixe = brut + prime + charges + mutuelle + transport + medecine/12
  // = 3750 + 37.5 + 1666.5 + 50 + 42 + 100/12 = 5554.33
  approx(cost.coutFixeMensuel, 5554.33, 1, 'coût fixe mensuel')
  // variable = urssaf + tickets = 96 + 6 = 102
  approx(cost.coutVariableJournalier, 102, 0.01, 'coût variable par jour (urssaf + tickets)')
}

/* ──────────────────────────────────────────────────────────────────────────
 * Test 2 — ETAM Province (taux 38%) sans avantages
 * ────────────────────────────────────────────────────────────────────────── */
section('computeEmployerCost — ETAM Province brut 30k sans avantages')

{
  const cost = computeEmployerCost({
    ...REF_CADRE,
    brutAnnuel: 30000,
    statut: 'etam',
    coefficient: 250,
    position: '2.3',
    lieu: 'province',
    avantages: {},
  })
  approx(cost.tauxCharges, 0.38, 0.001, 'taux charges ETAM = 38%')
  approx(cost.brutMensuel, 2500, 0.01, 'brut mensuel = 30000/12')
  approx(cost.primeVacancesMensualisee, 25, 0.01, 'prime vacances')
  // charges = (2500 + 25) × 0.38 = 959.5
  approx(cost.chargesPatronales, 959.5, 0.5, 'charges patronales')
  // fixe = 2500 + 25 + 959.5 + 0 avantages = 3484.5
  approx(cost.coutFixeMensuel, 3484.5, 1, 'coût fixe')
  approx(cost.coutVariableJournalier, 0, 0.01, 'variable = 0 sans avantages')
}

/* ──────────────────────────────────────────────────────────────────────────
 * Test 3 — Avec 13e mois activé
 * ────────────────────────────────────────────────────────────────────────── */
section('computeEmployerCost — 13e mois activé')

{
  const cost = computeEmployerCost({
    ...REF_CADRE,
    avantages: { ...REF_CADRE.avantages, treiziemeMois: true },
  })
  approx(cost.treiziemeMoisMensualise, 312.5, 0.01, '13e mois = brut/12/12 × 12 = brut/12')
  // Wait: treizieme = brutMensuel / 12 = 3750/12 = 312.5 ? Non, c'est pas ça.
  // En fait treizieme = brutMensuel/12 ≈ 312.5 (= 1 mois supplémentaire / 12 mois)
  // = bonus annuel = 1 mois de brut = 3750 ; mensualisé = 312.5
  // Assiette charges = brut + 13e + prime = 3750 + 312.5 + 37.5 = 4100
  approx(cost.chargesPatronales, 1804, 1, 'charges sur assiette élargie')
}

/* ──────────────────────────────────────────────────────────────────────────
 * Test 4 — Calendrier français — jours ouvrés
 * ────────────────────────────────────────────────────────────────────────── */
section('calendar — working days')

{
  // Novembre 2024 : 30 jours, 1/11 (vendredi) et 11/11 (lundi) fériés
  // weekdays = 1, 4, 5, 6, 7, 8, 11, 12, 13, 14, 15, 18, 19, 20, 21, 22,
  //            25, 26, 27, 28, 29 = 21 weekdays
  // Moins 1/11 et 11/11 fériés = 19 ouvrés
  const nov = workingDaysInRange(new Date(2024, 10, 1), new Date(2024, 10, 30))
  eq(nov, 19, 'Nov 2024 working days = 19 (1/11 + 11/11 fériés)')

  // Août 2025 : 21 weekdays - 15/08 férié (vendredi) = 20
  const aug = workingDaysInRange(new Date(2025, 7, 1), new Date(2025, 7, 31))
  eq(aug, 20, 'Août 2025 working days = 20 (15/08 férié)')

  // Octobre 2025 : 0 férié, 31 jours dont 8 weekend = 23 weekdays
  const oct = workingDaysInRange(new Date(2025, 9, 1), new Date(2025, 9, 31))
  eq(oct, 23, 'Octobre 2025 working days = 23 (0 férié)')
}

/* ──────────────────────────────────────────────────────────────────────────
 * Test 5 — Profil mensuel mission 12 mois
 * ────────────────────────────────────────────────────────────────────────── */
section('missionMonthProfile — 12 mois depuis 01/11/2024')

{
  const profile = missionMonthProfile(new Date(2024, 10, 1), 12)
  eq(profile.length, 12, '12 mois calendaires')
  eq(profile[0].calendarMonth, 10, '1er mois = novembre (index 10)')
  eq(profile[0].year, 2024, '1er mois = 2024')
  eq(profile[0].workingDays, 19, '1er mois = 19 jours ouvrés (Nov 24)')
  eq(profile[11].calendarMonth, 9, '12e mois = octobre (index 9)')
  eq(profile[11].year, 2025, '12e mois = 2025')
}

/* ──────────────────────────────────────────────────────────────────────────
 * Test 6 — Marge mission réelle
 * ────────────────────────────────────────────────────────────────────────── */
section('computeMissionMargin — Cadre 45k TJM 650 sur 12 mois')

{
  const result = computeMissionMargin(REF_CADRE, 650, new Date(2024, 10, 1), 12)
  eq(result.monthCount, 12, 'monthCount = 12')
  // Total jours ouvrés Nov 24 → Oct 25 (réels avec fériés) :
  // 19 + 21 + 22 + 20 + 21 + 21 + 19 + 20 + 22 + 20 + 22 + 23 = 250
  eq(result.totalWorkingDays, 250, 'total jours ouvrés = 250')
  approx(result.revenuTotalEur, 650 * 250, 1, 'revenu total = 650 × 250 = 162500')
  // Coût total = 5554.33 × 12 + 102 × 250 = 66652 + 25500 = 92152
  approx(result.coutTotalMission, 92152, 50, 'coût total mission')
  // Marge = 162500 - 92152 = 70348
  approx(result.margeTotaleEur, 70348, 100, 'marge totale ≈ 70 350 €')
  // Marge % ≈ 43.3 %
  approx(result.margePct, 43.3, 0.3, 'marge % ≈ 43.3 %')
}

/* ──────────────────────────────────────────────────────────────────────────
 * Test 7 — Risque rupture : 0 pendant essai, indemnité après
 * ────────────────────────────────────────────────────────────────────────── */
section('computeRuptureRiskProfile — cadre 7m essai puis cliff')

{
  const profile = computeRuptureRiskProfile(REF_CADRE, 650, new Date(2024, 10, 1), 12)
  eq(profile.finEssaiMois, 7, 'fin essai cadre = 7 mois')
  eq(profile.preavisMois, 3, 'préavis cadre = 3 mois')
  eq(profile.points.length, 12, '12 points (1 par mois)')
  // Pendant essai (mois 1-7), coût rupture = 0
  eq(profile.points[0].coutRupture, 0, 'mois 1 : coût rupture = 0 (essai)')
  eq(profile.points[6].coutRupture, 0, 'mois 7 : coût rupture = 0 (dernier mois essai)')
  // Mois 8 : post-essai, coût rupture > 0
  const post = profile.points[7]
  eq(post.isPostEssai, true, 'mois 8 = post-essai')
  // Coût rupture ≈ préavis 3 × salaire_chargé (5454) + indemnité Art 4.5 (faible) + indemnité CP
  // = 3 × 5454 + ~600 + ~2200 ≈ 19 162
  if (post.coutRupture < 18000 || post.coutRupture > 22000) {
    failed++
    failures.push(`  ❌ mois 8 coût rupture hors plage attendue [18k, 22k]\n    reçu : ${post.coutRupture}`)
  } else {
    passed++
  }
}

/* ──────────────────────────────────────────────────────────────────────────
 * Test 8 — Minimum conventionnel Syntec
 * ────────────────────────────────────────────────────────────────────────── */
section('validateAgainstMinimum — vérif minimum Syntec')

{
  // Brut 45k pour cadre 2.2 coef 130 modalité 3 → bien au-dessus du minimum
  const ok = validateAgainstMinimum(REF_CADRE)
  eq(ok.ok, true, 'brut 45k > minimum cadre 2.2')

  // Brut 20k pour le même profil → sous minimum
  const ko = validateAgainstMinimum({ ...REF_CADRE, brutAnnuel: 20000 })
  eq(ko.ok, false, 'brut 20k < minimum cadre 2.2')
}

/* ──────────────────────────────────────────────────────────────────────────
 * Synthèse
 * ────────────────────────────────────────────────────────────────────────── */

console.log(`\n${'═'.repeat(50)}`)
console.log(`Résultat : ${passed} PASS, ${failed} FAIL`)
if (failed > 0) {
  console.log('\nÉchecs :\n' + failures.join('\n'))
  process.exit(1)
}
console.log('✓ Tous les invariants pricing sont OK.')
