/**
 * Quotas — 3 niveaux complémentaires :
 *
 *   1. Per-user per-day (DAILY_LIMITS / consumeQuota) — filet anti-abus
 *      contre un script ou un user trop gourmand. Table daily_usage,
 *      atomique via RPC bump_usage.
 *
 *   2. Per-org per-period (consumeOrgLlmAction) — cap de crédits IA
 *      dérivé du plan (cf. quota-tiers.ts) + override custom.
 *      - Plans payants : reset tous les 30 j à l'anniversaire de
 *        l'abonnement (`llm_period_start` stampé par le webhook Stripe
 *        à l'activation, puis avancé par bonds de 30 j).
 *      - Essai gratuit : POT UNIQUE de 1 700 crédits sur les 15 j,
 *        pas de reset.
 *      Filet de sécurité : si le cron quotidien rate un passage, le
 *      reset se fait à la volée dans consumeOrgLlmAction.
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

/**
 * Daily per-user caps. Volontairement très hauts (10 000) — l'utilisateur
 * normal ne les atteint jamais. Ils ne servent QUE de filet de sécurité
 * extrême contre un script qui boucle, en complément du cap mensuel org
 * (qui est la vraie limite anti-abus).
 *
 * On ne montre PAS ces caps à l'utilisateur (pas de "crédits" / "actions
 * restantes" côté UI). La logique reste pour le compteur daily_usage qui
 * sert au monitoring interne.
 */
export const DAILY_LIMITS: Record<QuotaAction, number> = {
  upload: 10_000,
  match: 10_000,
  compose: 10_000,
  assistant: 10_000,
  send: 10_000,
  critique: 10_000,
}

/**
 * Libellés humains pour les éventuels messages d'erreur daily. En usage
 * normal ces messages ne sortent jamais (les caps sont à 10k/jour), ils
 * ne servent que pour les rares logs internes.
 */
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
    .select("subscription_status, subscription_seats, subscription_has_pricing, trial_ends_at, lockdown_started_at, current_period_end, quota_override_json, llm_actions_this_month, llm_period_start")
    .eq("id", orgId)
    .maybeSingle()

  if (error || !org) {
    return { ok: true, used: 0, limit: 0, code: "no_org" }
  }

  // Récupère le quota dérivé du plan + override + period.
  const quota = getQuotas(org as Parameters<typeof getQuotas>[0], { isAdmin: opts?.isAdmin })

  // Admin Naywa = pas de check (quota effectivement infini).
  if (quota.source === "admin") {
    return { ok: true, used: 0, limit: quota.llmMonthly }
  }

  // ─── Reset à la volée pour les plans MENSUELS (anniversaire abo) ───
  // Pour les plans payants, le quota se renouvelle tous les 30 j à partir
  // de llm_period_start (stampé à l'activation de l'abonnement par le
  // webhook Stripe). Si le cron quotidien rate son passage on rattrape ici.
  //
  // Pendant l'essai gratuit (period="fixed") on NE reset PAS : c'est un
  // pot unique de N crédits à consommer sur les 15 j.
  let currentUsed = org.llm_actions_this_month ?? 0
  const RESET_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000
  if (quota.period === "month" && org.llm_period_start) {
    const periodStart = new Date(org.llm_period_start).getTime()
    if (Number.isFinite(periodStart) && Date.now() - periodStart >= RESET_INTERVAL_MS) {
      // Avance la fenêtre par bonds de 30 j jusqu'à ce qu'on tombe sur
      // une période qui couvre maintenant (si plusieurs mois ont sauté).
      let next = periodStart
      while (Date.now() - next >= RESET_INTERVAL_MS) next += RESET_INTERVAL_MS
      currentUsed = 0
      await admin.from("organizations")
        .update({
          llm_actions_this_month: 0,
          llm_period_start: new Date(next).toISOString(),
        })
        .eq("id", orgId)
    }
  }

  if (currentUsed >= quota.llmMonthly) {
    // Wording côté utilisateur : on ne parle pas de "crédits" — la
    // limite est purement un anti-abus, le client n'est pas censé la
    // voir en usage normal.
    const resetMsg = quota.period === "fixed"
      ? "Limite d'usage IA atteinte pour votre période d'essai. Souscrivez pour continuer."
      : "Limite d'usage IA atteinte pour cette période. Contactez-nous si vous avez besoin d'un palier supérieur."
    return {
      ok: false,
      used: currentUsed,
      limit: quota.llmMonthly,
      code: "quota_exceeded",
      message: resetMsg,
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

// ─── Niveau 3 : Per-org CV (plafond principal, visible client) ─────────

export interface CvQuotaResult {
  ok: boolean
  used: number
  limit: number
  code?: "quota_exceeded" | "no_org"
  message?: string
}

/**
 * Compte les CV ACTIFS d'une org = ce que le sourceur voit dans le vivier.
 * On EXCLUT les doublons archivés (tag "ancien") : ce sont d'anciennes copies
 * masquées de l'UI, elles ne doivent pas gonfler le compteur de capacité
 * (sinon 80 affichés côté quota vs 77 dans le vivier = incohérence).
 *
 * Implémentation : total − archivés (2 counts). Évite le piège du filtre
 * "not contains" sur les lignes à tags NULL (qui seraient wrongly exclues).
 */
export async function countActiveCvs(
  admin: SupabaseClient<Database>,
  orgId: string,
): Promise<number> {
  const [{ count: total }, { count: archived }] = await Promise.all([
    admin.from("candidates").select("id", { count: "exact", head: true })
      .eq("organization_id", orgId),
    admin.from("candidates").select("id", { count: "exact", head: true })
      .eq("organization_id", orgId).contains("tags", ["ancien"]),
  ])
  return Math.max(0, (total ?? 0) - (archived ?? 0))
}

/**
 * Vérifie que l'org peut ajouter UN CV de plus. Plafond principal (et seul
 * visible côté client) : nombre de CV dans le vivier vs `cvLimit` du plan.
 * On compte les lignes `candidates` (exact, sans dépendance cron). À appeler
 * juste avant d'insérer une NOUVELLE candidate (les doublons ne comptent pas
 * — ils sont détectés + renvoyés avant, sans ajouter de ligne).
 */
export async function checkCvQuota(
  admin: SupabaseClient<Database>,
  orgId: string,
  opts?: { isAdmin?: boolean },
): Promise<CvQuotaResult> {
  const { data: org, error } = await admin
    .from("organizations")
    .select("subscription_status, subscription_seats, subscription_has_pricing, trial_ends_at, lockdown_started_at, current_period_end, quota_override_json")
    .eq("id", orgId)
    .maybeSingle()

  if (error || !org) {
    return { ok: true, used: 0, limit: 0, code: "no_org" }
  }

  const quota = getQuotas(org as Parameters<typeof getQuotas>[0], { isAdmin: opts?.isAdmin })
  if (quota.source === "admin") {
    return { ok: true, used: 0, limit: quota.cvLimit }
  }

  const used = await countActiveCvs(admin, orgId)

  if (used >= quota.cvLimit) {
    return {
      ok: false,
      used,
      limit: quota.cvLimit,
      code: "quota_exceeded",
      message: `Capacité du vivier atteinte (${quota.cvLimit.toLocaleString("fr-FR")} CV sur ${quota.label}). Supprimez d'anciens CV ou contactez-nous pour un palier supérieur.`,
    }
  }

  return { ok: true, used, limit: quota.cvLimit }
}

// ─── Niveau 4 : Per-org storage (filet interne, jamais montré) ─────────

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
    .select("subscription_status, subscription_seats, subscription_has_pricing, trial_ends_at, lockdown_started_at, current_period_end, quota_override_json, storage_used_bytes")
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
