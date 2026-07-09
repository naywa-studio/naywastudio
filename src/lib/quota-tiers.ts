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
  /** Capacité du vivier en NOMBRE DE CV — le SEUL plafond visible côté
   *  client. On compte les lignes `candidates` de l'org (instantané, exact,
   *  sans dépendance cron). Englobe implicitement stockage + parsing, qui
   *  montent ensemble. Matchings/anonymisations restent illimités. */
  cvLimit: number
  storageBytes: number
  /** Cap de crédits IA pour la période courante.
   *  - Sur un plan payant : cap mensuel renouvelé tous les 30 j à
   *    l'anniversaire de l'abonnement (cf. lib/quota.ts).
   *  - Pendant l'essai gratuit : pot UNIQUE consommé sur les 15 j,
   *    pas de reset. La valeur stockée est donc le pot total, pas
   *    une cadence mensuelle malgré le nom.
   */
  llmMonthly: number
  /** Cadence de renouvellement du quota crédits IA :
   *  - "month" → reset tous les 30 j (anniversaire abo)
   *  - "fixed" → pas de reset (essai gratuit : pot unique)
   *  L'UI s'en sert pour adapter le wording ("X / mois" vs "X au total"). */
  period: "month" | "fixed"
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
 * MODÈLE CLIENT : un seul plafond visible = `cvLimit` (capacité du vivier
 * en nombre de CV). Matchings + anonymisations illimités. `storageBytes` et
 * `llmMonthly` restent en FILET INTERNE (anti-abus, jamais montrés) et sont
 * volontairement larges pour ne JAMAIS mordre avant la limite de CV.
 *
 * Dimensionnement :
 *   - cvLimit : 5k / 10k / 20k / 30k selon sièges (généreux — nos coûts sont
 *     dérisoires : ~1 Mo/CV sur R2 à $0.015/GB, ~$0.001/action gpt-4o-mini).
 *   - storageBytes : ~2 Mo/CV de marge (original + PDF anonymisé + docx) →
 *     toujours au-dessus du besoin réel, ne bloque jamais avant cvLimit.
 *   - llmMonthly : plafond anti-abus très haut, invisible côté client.
 *
 * Pro = mêmes plafonds vivier que Std (le premium porte sur la Suite Pricing
 * Syntec, pas sur des quotas gonflés).
 */
export const QUOTAS_BY_PLAN: Record<string, { cvLimit: number; storageBytes: number; llmMonthly: number }> = {
  sourcing_1:     { cvLimit:  5_000, storageBytes: 10 * GB, llmMonthly: 1_000_000 },
  sourcing_2:     { cvLimit: 10_000, storageBytes: 20 * GB, llmMonthly: 1_000_000 },
  sourcing_3:     { cvLimit: 20_000, storageBytes: 40 * GB, llmMonthly: 1_000_000 },
  sourcing_4:     { cvLimit: 30_000, storageBytes: 60 * GB, llmMonthly: 1_000_000 },
  sourcing_pro_1: { cvLimit:  5_000, storageBytes: 10 * GB, llmMonthly: 1_000_000 },
  sourcing_pro_2: { cvLimit: 10_000, storageBytes: 20 * GB, llmMonthly: 1_000_000 },
  sourcing_pro_3: { cvLimit: 20_000, storageBytes: 40 * GB, llmMonthly: 1_000_000 },
  sourcing_pro_4: { cvLimit: 30_000, storageBytes: 60 * GB, llmMonthly: 1_000_000 },
}

/**
 * Quota appliqué pendant l'essai 15j. POT UNIQUE — pas de reset
 * mensuel pendant l'essai. Stockage serré (500 MB suffit pour tester
 * sérieusement), crédits IA pensés pour 15 j d'usage normal :
 * 1 700 crédits ≈ ~110 actions LLM/jour pendant tout l'essai.
 */
const TRIAL_QUOTAS = { cvLimit: 500, storageBytes: 2 * GB, llmMonthly: 1_000_000 }

/**
 * Quotas "infinis" pour les comptes admin Naywa. On retourne une valeur
 * très haute plutôt qu'Infinity pour éviter les soucis JSON/UI.
 */
const ADMIN_QUOTAS = { cvLimit: 9_999_999, storageBytes: 1024 * GB, llmMonthly: 999_999_999 }

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
    return {
      ...ADMIN_QUOTAS, period: "month",
      source: "admin", label: "Admin Naywa — quotas illimités",
    }
  }

  if (!org) {
    return {
      cvLimit: 0, storageBytes: 0, llmMonthly: 0, period: "month",
      source: "lockdown", label: "Aucune organisation",
    }
  }

  // 1. Override custom prioritaire — admin Naywa a accordé un quota
  //    custom à ce client (extras facturés hors-Stripe en V1).
  const override = org.quota_override_json
  if (override && (override.cv != null || override.storage_gb != null || override.llm_monthly != null)) {
    return {
      cvLimit: override.cv ?? 5_000,
      storageBytes: (override.storage_gb ?? 10) * GB,
      llmMonthly: override.llm_monthly ?? 1_000_000,
      period: "month",
      source: "override",
      label: "Quota personnalisé",
    }
  }

  // 2. Lockdown → stockage figé (lecture seule), aucune action LLM.
  if (isInLockdown(org)) {
    return {
      cvLimit: 0, storageBytes: 0, llmMonthly: 0, period: "month",
      source: "lockdown",
      label: "Abonnement suspendu",
    }
  }

  // 3. Plan actif Stripe.
  const lookup = org.subscription_price_lookup
  if (lookup && QUOTAS_BY_PLAN[lookup]) {
    const q = QUOTAS_BY_PLAN[lookup]
    return {
      ...q, period: "month",
      source: "plan",
      label: planLabel(lookup),
    }
  }

  // 4. Trial Naywa (15j). hasActiveAccess couvre ce cas avec
  //    trialEnds > now (sans subscription_status). Pot fixe : pas
  //    de renouvellement pendant les 15 j.
  if (hasActiveAccess(org)) {
    return {
      ...TRIAL_QUOTAS, period: "fixed",
      source: "trial", label: "Essai gratuit (15 jours)",
    }
  }

  // 5. Aucun accès — l'org n'a ni trial actif ni abonnement.
  return {
    cvLimit: 0, storageBytes: 0, llmMonthly: 0, period: "month",
    source: "lockdown", label: "Aucun accès actif",
  }
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
