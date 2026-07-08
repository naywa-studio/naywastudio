/**
 * Gate déterministe du "Matcher le vivier" (pré-filtre gratuit, avant le LLM).
 *
 * 3 modes (cf. spec secteurs) :
 *   - "intelligent"  : Nora choisit les secteurs cibles + séniorité ±2 + contrat.
 *   - "personnalise" : idem, mais l'user a ajusté les secteurs cibles (chips).
 *     → MÊME gate que "intelligent" ; seul `target_sectors` diffère (édité).
 *   - "complet"      : aucun filtre, tout le vivier est scoré.
 *
 * Règle de fiabilité — on n'exclut JAMAIS dans le doute :
 *   - séniorité inconnue → gardé ;
 *   - candidat `to_review` ou sans secteur → gardé (jamais exclu par le secteur) ;
 *   - mission sans séniorité/secteur cible → le filtre correspondant est off.
 * Le gate ne fait que retirer des candidats CLAIREMENT hors périmètre ; la
 * pertinence fine reste jugée par le LLM sur le sous-ensemble gardé.
 */

import type { Candidate, Job } from "./database.types"

export type MatchMode = "intelligent" | "personnalise" | "complet"

/** Champs candidat nécessaires au gate (sous-ensemble de Candidate). */
export type GateCandidate = Pick<
  Candidate,
  "years_experience" | "is_apprentice" | "sectors" | "sector_status"
>

/** Champs mission nécessaires au gate. */
export type GateJob = Pick<Job, "normalized" | "contract_type" | "target_sectors">

/** Un candidat passe-t-il le gate pour ce mode ? */
export function passesGate(cand: GateCandidate, job: GateJob, mode: MatchMode): boolean {
  if (mode === "complet") return true

  // "intelligent" et "personnalise" appliquent le MÊME gate : séniorité ±2 +
  // contrat + secteurs cibles. Ils ne diffèrent que par la provenance de
  // `job.target_sectors` (auto Nora vs édité par l'user), déjà résolue avant.

  // ── Séniorité (±2). Inconnue = gardé. ──
  const smin = job.normalized?.seniority_min_years ?? null
  const smax = job.normalized?.seniority_max_years ?? null
  const hasBand = smin != null || smax != null
  if (hasBand && cand.years_experience != null) {
    const margin = 2
    const lo = (smin ?? smax ?? 0) - margin
    const hi = (smax ?? smin ?? 0) + margin
    if (cand.years_experience < lo || cand.years_experience > hi) return false
  }

  // ── Contrat + secteur. ──
  // Contrat alternance/stage : on écarte les profils clairement séniors
  // (≥ 5 ans post-diplôme ET pas en alternance). Inconnu / apprenti = gardé.
  const ct = (job.contract_type ?? "").toLowerCase()
  const isWorkStudy = ct.includes("altern") || ct.includes("stage") || ct.includes("apprent")
  if (isWorkStudy && !cand.is_apprentice && (cand.years_experience ?? 0) >= 5) {
    return false
  }

  // Secteur : mission sans cible → off. Candidat non classé → jamais exclu.
  const targets = job.target_sectors ?? []
  if (targets.length > 0) {
    if (cand.sector_status === "to_review" || cand.sectors.length === 0) return true
    const overlap = cand.sectors.some((s) => targets.includes(s))
    if (!overlap) return false
  }

  return true
}

/** Sépare un pool en gardés / écartés selon le mode. */
export function partitionByGate<T extends GateCandidate>(
  candidates: T[],
  job: GateJob,
  mode: MatchMode,
): { kept: T[]; gatedOut: T[] } {
  const kept: T[] = []
  const gatedOut: T[] = []
  for (const c of candidates) {
    if (passesGate(c, job, mode)) kept.push(c)
    else gatedOut.push(c)
  }
  return { kept, gatedOut }
}
