/**
 * Preset séniorité pricing — mapping séniorité ↔ Syntec (statut, position,
 * coefficient, modalité).
 *
 * Partagé entre :
 *   - le PricingWidget (sélecteur séniorité, sélection préset)
 *   - la page parent pricing/[jobId] (calcul rapide de marge pour la liste
 *     candidats)
 *
 * Auto-détection à partir du CV parsé (years_experience + titre).
 */

import type { Modalite, Statut } from "@/lib/pricing/syntec"
import type { ParsedCv } from "@/lib/database.types"

export type SenioritePreset = "junior" | "confirme" | "senior" | "lead_expert"

export const PRESETS: Record<SenioritePreset, {
  statut: Statut
  position: string
  coefficient: number
  modalite: Modalite
  label: string
  short: string
}> = {
  junior:      { statut: "cadre", position: "1.2", coefficient: 100, modalite: "modalite_1", label: "Junior (0-3 ans XP)",        short: "Junior" },
  confirme:    { statut: "cadre", position: "2.1", coefficient: 115, modalite: "modalite_1", label: "Confirmé (4-7 ans XP)",      short: "Confirmé" },
  senior:      { statut: "cadre", position: "2.2", coefficient: 130, modalite: "modalite_3", label: "Senior (8-11 ans XP)",       short: "Senior" },
  lead_expert: { statut: "cadre", position: "3.1", coefficient: 170, modalite: "modalite_3", label: "Lead / Expert (12+ ans XP)", short: "Lead/Expert" },
}

export function detectSeniority(
  parsed: ParsedCv | null,
  currentTitle: string | null,
): SenioritePreset {
  const title = (parsed?.current_title ?? currentTitle ?? "").toLowerCase()
  const years = parsed?.years_experience ?? 0
  if (/principal|staff|head\b|cto|directeur tech/.test(title)) return "lead_expert"
  if (/lead|architect|expert|manager principal/.test(title)) return "lead_expert"
  if (/senior|sr\.|sr\b|tech lead/.test(title) && years >= 7) return "senior"
  if (years >= 12) return "lead_expert"
  if (years >= 8) return "senior"
  if (years >= 4) return "confirme"
  return "junior"
}
