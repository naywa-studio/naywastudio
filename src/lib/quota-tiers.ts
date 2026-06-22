/**
 * Grille des quotas par plan d'abonnement.
 *
 * Source unique : si tu changes une valeur ici, tous les clients du
 * plan correspondant voient instantanément le nouveau quota (pas de
 * SQL à passer, pas de migration data). Les valeurs ne sont PAS
 * stockées dans la DB — seul `quota_override_json` permet de dévier
 * du plan pour un client spécifique (extras facturés hors-Stripe).
 *
 * Bytes ≠ GB : 1 GB = 2^30 bytes = 1 073 741 824 (binaire), pas 10^9.
 * On utilise la convention "binaire" pour cohérence avec la facturation
 * R2 et Vercel.
 */

import type { Organization } from "@/lib/database.types"
import { hasActiveAccess, isInLockdown } from "@/lib/subscription"

const GB = 1024 * 1024 * 1024

export interface Quotas {
  storageBytes: number
  llmMonthly: number
  /** Origine du quota — utile pour l'UI ("Plan Sourcing 2 sièges",
   *  "Override custom", "Essai gratuit", "Suspension"...). */
  source: "plan" | "override" | "trial" | "lockdown" | "admin"
  /** Libellé court humain — pour tooltip jauge. */
  label: string
}

/**
 * Grille par lookup_key Stripe. Les clés correspondent à
 * sourcing_1..4 et sourcing_pro_1..4 (cf. lib/stripe.ts).
 *
 * Logique :
 *   - 1 GB de stockage par siège (Std) — couvre ~2 000 CVs/siège,
 *     soit environ 2 ans d'historique pour un sourceur actif
 *   - 1.5 GB / siège pour la variante Pro (vivier souvent plus riche)
 *   - +2 300 crédits LLM par siège supplémentaire (Std) ou +3 000 (Pro)
 *   - 1er siège plus généreux côté crédits : 1 700 (Std) / 2 200 (Pro)
 */
export const QUOTAS_BY_PLAN: Record<string, { storageBytes: number; llmMonthly: number }> = {
  sourcing_1:     { storageBytes: 1   * GB, llmMonthly:  1_700 },
  sourcing_2:     { storageBytes: 2   * GB, llmMonthly:  4_000 },
  sourcing_3:     { storageBytes: 3   * GB, llmMonthly:  6_300 },
  sourcing_4:     { storageBytes: 4   * GB, llmMonthly:  8_600 },
  sourcing_pro_1: { storageBytes: 1.5 * GB, llmMonthly:  2_200 },
  sourcing_pro_2: { storageBytes: 3   * GB, llmMonthly:  5_200 },
  sourcing_pro_3: { storageBytes: 4.5 * GB, llmMonthly:  8_200 },
  sourcing_pro_4: { storageBytes: 6   * GB, llmMonthly: 11_200 },
}

/** Quota appliqué pendant l'essai 15j (équivalent Sourcing 1 siège). */
const TRIAL_QUOTAS = { storageBytes: 1 * GB, llmMonthly: 1_700 }

/**
 * Quotas "infinis" pour les comptes admin Naywa. On retourne une valeur
 * très haute plutôt qu'Infinity pour éviter les soucis JSON/UI.
 */
const ADMIN_QUOTAS = { storageBytes: 1024 * GB, llmMonthly: 999_999_999 }

/**
 * Résout les quotas effectifs pour une organisation. Ordre :
 *   1. Admin Naywa → quotas infinis
 *   2. Override custom → utilise quota_override_json
 *   3. Lockdown (sub canceled / past_due) → 0 LLM, stockage figé
 *   4. Plan actif (paid ou trialing Stripe) → grille QUOTAS_BY_PLAN
 *   5. Trial 15j Naywa → TRIAL_QUOTAS
 *   6. Aucun accès → 0
 */
/**
 * Type minimal pour calculer les quotas. Inclut current_period_end
 * car isInLockdown/hasActiveAccess en dépendent.
 */
type OrgForQuotas = Pick<Organization,
  | "subscription_status" | "subscription_price_lookup"
  | "trial_ends_at" | "lockdown_started_at" | "quota_override_json"
  | "current_period_end"
>

export function getQuotas(
  org: OrgForQuotas | null,
  opts?: { isAdmin?: boolean },
): Quotas {
  if (opts?.isAdmin) {
    return { ...ADMIN_QUOTAS, source: "admin", label: "Admin Naywa — quotas illimités" }
  }

  if (!org) {
    return { storageBytes: 0, llmMonthly: 0, source: "lockdown", label: "Aucune organisation" }
  }

  // 1. Override custom prioritaire — admin Naywa a accordé un quota
  //    custom à ce client (extras facturés hors-Stripe en V1).
  const override = org.quota_override_json
  if (override && (override.storage_gb != null || override.llm_monthly != null)) {
    return {
      storageBytes: (override.storage_gb ?? 2) * GB,
      llmMonthly: override.llm_monthly ?? 1_700,
      source: "override",
      label: "Quota personnalisé",
    }
  }

  // 2. Lockdown → stockage figé (lecture seule), aucune action LLM.
  if (isInLockdown(org)) {
    return {
      storageBytes: 0, llmMonthly: 0,
      source: "lockdown",
      label: "Abonnement suspendu",
    }
  }

  // 3. Plan actif Stripe.
  const lookup = org.subscription_price_lookup
  if (lookup && QUOTAS_BY_PLAN[lookup]) {
    const q = QUOTAS_BY_PLAN[lookup]
    return {
      ...q,
      source: "plan",
      label: planLabel(lookup),
    }
  }

  // 4. Trial Naywa (15j). hasActiveAccess couvre ce cas avec
  //    trialEnds > now (sans subscription_status).
  if (hasActiveAccess(org)) {
    return { ...TRIAL_QUOTAS, source: "trial", label: "Essai gratuit (15 jours)" }
  }

  // 5. Aucun accès — l'org n'a ni trial actif ni abonnement.
  return { storageBytes: 0, llmMonthly: 0, source: "lockdown", label: "Aucun accès actif" }
}

function planLabel(lookup: string): string {
  const m = /^sourcing(?:_pro)?_(\d)$/.exec(lookup)
  if (!m) return lookup
  const pro = lookup.startsWith("sourcing_pro")
  const seats = m[1]
  return `Plan ${pro ? "Sourcing Pro" : "Sourcing"} — ${seats} siège${Number(seats) > 1 ? "s" : ""}`
}

// ─── Formatage humain ──────────────────────────────────────────────────

/** Formate une taille en bytes en chaîne lisible (GB / MB). */
export function formatBytes(bytes: number): string {
  if (bytes >= GB) return `${(bytes / GB).toFixed(1)} GB`
  const MB = 1024 * 1024
  if (bytes >= MB) return `${(bytes / MB).toFixed(0)} MB`
  return `${(bytes / 1024).toFixed(0)} KB`
}

/** Pourcentage d'utilisation, plafonné à 100 pour l'UI. */
export function quotaPercent(used: number, total: number): number {
  if (total <= 0) return 0
  return Math.min(100, Math.round((used / total) * 100))
}
