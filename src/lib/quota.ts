/**
 * Quotas — 2 niveaux complémentaires :
 *
 *   1. Per-user per-day (DAILY_LIMITS / consumeQuota) — filet anti-abus
 *      contre un script ou un user trop gourmand. Tabe daily_usage,
 *      atomique via RPC bump_usage.
 *
 *   2. Per-org per-month (consumeOrgLlmAction) — quota mensuel dérivé
 *      du plan (cf. quota-tiers.ts) + override custom. Compteur sur
 *      organizations.llm_actions_this_month, reset le 1er via cron.
 *      Filet de sécurité : si llm_period_start < mois courant on
 *      reset à la volée (au cas où le cron rate un mois).
 *
 *   3. Per-org storage (checkStorageQuota / incrementStorageUsed) —
 *      taille R2 utilisée, hard cap à l'upload. Recalcul nightly.
 *
 * Admin Naywa bypass tout (getQuotas avec isAdmin=true retourne des
 * valeurs effectivement infinies).
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "./database.types"
import { getQuotas } from "./quota-tiers"
import { isAdmin } from "./admin"

// ─── Niveau 1 : Per-user per-day ──────────────────────────────────────

export type QuotaAction = "upload" | "match" | "compose" | "assistant" | "send" | "critique"

export const DAILY_LIMITS: Record<QuotaAction, number> = {
  upload: 50,
  match: 40,
  compose: 80,
  assistant: 120,
  send: 60,
  critique: 80,
}

const LABELS: Record<QuotaAction, string> = {
  upload: "imports de CV",
  match: "lancements de matching",
  compose: "messages générés",
  assistant: "questions à l'assistant",
  send: "emails envoyés",
  critique: "relectures de message",
}

export interface QuotaResult {
  ok: boolean
  used: number
  limit: number
  message?: string
}

/**
 * Atomically consume one unit of the given action for today.
 * Returns ok:false (without consuming further) once the daily limit is hit.
 *
 * Pass the **admin** client — the RPC is SECURITY DEFINER and not granted
 * to anon/authenticated.
 */
export async function consumeQuota(
  admin: SupabaseClient<Database>,
  userId: string,
  action: QuotaAction,
): Promise<QuotaResult> {
  const limit = DAILY_LIMITS[action]
  const { data, error } = await admin.rpc("bump_usage", {
    p_user: userId,
    p_action: action,
  })

  // On a counter failure we fail OPEN (don't block the user on infra hiccups).
  if (error || typeof data !== "number") {
    return { ok: true, used: 0, limit }
  }

  if (data > limit) {
    return {
      ok: false,
      used: data,
      limit,
      message: `Limite quotidienne atteinte (${limit} ${LABELS[action]}/jour). Réessayez demain.`,
    }
  }
  return { ok: true, used: data, limit }
}

// ─── Niveau 2 : Per-org per-month LLM ──────────────────────────────────

export interface OrgLlmQuotaResult {
  ok: boolean
  used: number
  limit: number
  /** Code court pour l'API : "quota_exceeded" si bloqué. */
  code?: "quota_exceeded" | "no_org"
  message?: string
}

/**
 * Vérifie + incrémente atomiquement le compteur LLM mensuel d'une org.
 *
 * Race condition tolérée : 2 requêtes concurrentes peuvent toutes deux
 * voir "used < limit" et bumper à used+1 — on peut dépasser de
 * quelques actions le cap exact. Acceptable : pas un trou de sécu,
 * juste un dépassement marginal qu'on assume.
 *
 * Reset à la volée si llm_period_start < début du mois courant.
 */
export async function consumeOrgLlmAction(
  admin: SupabaseClient<Database>,
  orgId: string,
  opts?: { isAdmin?: boolean },
): Promise<OrgLlmQuotaResult> {
  const { data: org, error } = await admin
    .from("organizations")
    .select("subscription_status, subscription_price_lookup, trial_ends_at, lockdown_started_at, current_period_end, quota_override_json, llm_actions_this_month, llm_period_start")
    .eq("id", orgId)
    .maybeSingle()

  if (error || !org) {
    return { ok: true, used: 0, limit: 0, code: "no_org" }
  }

  // Reset à la volée si on est passés sur un nouveau mois et que le
  // cron n'a pas encore tourné. On compare l'année-mois.
  const now = new Date()
  const currentMonthStart = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`
  let currentUsed = org.llm_actions_this_month ?? 0
  if (org.llm_period_start && org.llm_period_start < currentMonthStart) {
    currentUsed = 0
    await admin.from("organizations")
      .update({ llm_actions_this_month: 0, llm_period_start: currentMonthStart })
      .eq("id", orgId)
  }

  // Récupère le quota dérivé du plan + override.
  const quota = getQuotas(org as Parameters<typeof getQuotas>[0], { isAdmin: opts?.isAdmin })

  // Admin Naywa = pas de check (quota effectivement infini).
  if (quota.source === "admin") {
    return { ok: true, used: 0, limit: quota.llmMonthly }
  }

  if (currentUsed >= quota.llmMonthly) {
    return {
      ok: false,
      used: currentUsed,
      limit: quota.llmMonthly,
      code: "quota_exceeded",
      message: `Quota de crédits IA atteint pour ce mois (${quota.llmMonthly} crédits / ${quota.label}). Repart au 1er du mois ou contactez-nous pour une extension.`,
    }
  }

  // Bump optimiste — si la requête concurrente nous coiffe au poteau,
  // c'est OK (race condition tolérée, cf. doc en tête de fonction).
  await admin.from("organizations")
    .update({ llm_actions_this_month: currentUsed + 1 })
    .eq("id", orgId)

  return { ok: true, used: currentUsed + 1, limit: quota.llmMonthly }
}

/**
 * Wrapper "user-friendly" autour de consumeOrgLlmAction : résout
 * l'org_id depuis le user_id + détecte l'admin, en 1 appel.
 *
 * À utiliser dans les routes API LLM, juste après le check getUser()
 * et le consumeQuota daily, pour ne pas dupliquer 3 lookups par route.
 *
 * Si l'user n'a pas d'organization_id, on laisse passer (ok:true) —
 * c'est un cas dégénéré qui ne devrait pas arriver en prod, on fail
 * ouvert plutôt que de bloquer.
 */
export async function consumeOrgLlmActionForUser(
  admin: SupabaseClient<Database>,
  userId: string,
): Promise<OrgLlmQuotaResult> {
  const { data: profile } = await admin
    .from("profiles")
    .select("organization_id")
    .eq("user_id", userId)
    .maybeSingle()
  if (!profile?.organization_id) {
    return { ok: true, used: 0, limit: 0, code: "no_org" }
  }
  const adminFlag = await isAdmin(userId)
  return consumeOrgLlmAction(admin, profile.organization_id, { isAdmin: adminFlag })
}

// ─── Niveau 3 : Per-org storage ───────────────────────────────────────

export interface StorageQuotaResult {
  ok: boolean
  usedBytes: number
  limitBytes: number
  code?: "quota_exceeded" | "no_org"
  message?: string
}

/**
 * Vérifie qu'un upload de `additionalBytes` reste dans le quota de
 * l'org. Pas d'increment ici — appeler incrementStorageUsed() après
 * l'upload réussi (sinon on bump pour un upload qui peut échouer).
 */
export async function checkStorageQuota(
  admin: SupabaseClient<Database>,
  orgId: string,
  additionalBytes: number,
  opts?: { isAdmin?: boolean },
): Promise<StorageQuotaResult> {
  const { data: org, error } = await admin
    .from("organizations")
    .select("subscription_status, subscription_price_lookup, trial_ends_at, lockdown_started_at, current_period_end, quota_override_json, storage_used_bytes")
    .eq("id", orgId)
    .maybeSingle()

  if (error || !org) {
    return { ok: true, usedBytes: 0, limitBytes: 0, code: "no_org" }
  }

  const quota = getQuotas(org as Parameters<typeof getQuotas>[0], { isAdmin: opts?.isAdmin })

  if (quota.source === "admin") {
    return { ok: true, usedBytes: org.storage_used_bytes ?? 0, limitBytes: quota.storageBytes }
  }

  const used = org.storage_used_bytes ?? 0
  if (used + additionalBytes > quota.storageBytes) {
    return {
      ok: false,
      usedBytes: used,
      limitBytes: quota.storageBytes,
      code: "quota_exceeded",
      message: `Quota stockage atteint (${formatBytesShort(quota.storageBytes)} max sur ${quota.label}). Supprimez des CV anciens ou contactez-nous pour une extension.`,
    }
  }

  return { ok: true, usedBytes: used, limitBytes: quota.storageBytes }
}

/**
 * Incrémente le compteur storage_used_bytes après un upload réussi.
 * Idempotence : passer la **taille réelle** mesurée (HEAD R2 ou
 * file.size), pas une estimation. Si l'upload échoue après l'increment,
 * le cron nightly recalculera la vraie valeur.
 */
export async function incrementStorageUsed(
  admin: SupabaseClient<Database>,
  orgId: string,
  bytes: number,
): Promise<void> {
  if (bytes <= 0) return
  const { data: org } = await admin
    .from("organizations")
    .select("storage_used_bytes")
    .eq("id", orgId)
    .maybeSingle()
  if (!org) return
  await admin.from("organizations")
    .update({ storage_used_bytes: (org.storage_used_bytes ?? 0) + bytes })
    .eq("id", orgId)
}

/** Décrémente après une suppression. Plancher à 0 (jamais négatif). */
export async function decrementStorageUsed(
  admin: SupabaseClient<Database>,
  orgId: string,
  bytes: number,
): Promise<void> {
  if (bytes <= 0) return
  const { data: org } = await admin
    .from("organizations")
    .select("storage_used_bytes")
    .eq("id", orgId)
    .maybeSingle()
  if (!org) return
  const next = Math.max(0, (org.storage_used_bytes ?? 0) - bytes)
  await admin.from("organizations")
    .update({ storage_used_bytes: next })
    .eq("id", orgId)
}

function formatBytesShort(b: number): string {
  const GB = 1024 ** 3
  if (b >= GB) return `${(b / GB).toFixed(1)} GB`
  const MB = 1024 ** 2
  return `${(b / MB).toFixed(0)} MB`
}
