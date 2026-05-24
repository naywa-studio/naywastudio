/**
 * Per-user / per-day usage guardrails.
 *
 * A safety net against runaway LLM spend (a bug, a script, an over-eager
 * user). Limits are deliberately generous — they should never bite a
 * normal beta session, only catch abuse.
 *
 * Uses the `bump_usage` SQL function for an atomic increment, so a burst
 * of concurrent requests can't slip past the cap.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "./database.types"

export type QuotaAction = "upload" | "match" | "compose" | "assistant" | "send" | "critique" | "pricing_agent"

export const DAILY_LIMITS: Record<QuotaAction, number> = {
  upload: 50,
  match: 40,
  compose: 80,
  assistant: 120,
  send: 60,
  critique: 80,
  pricing_agent: 60,   // 1 boucle agent = potentiellement plusieurs appels OpenRouter
}

const LABELS: Record<QuotaAction, string> = {
  upload: "imports de CV",
  match: "lancements de matching",
  compose: "messages générés",
  assistant: "questions à l'assistant",
  send: "emails envoyés",
  critique: "relectures de message",
  pricing_agent: "analyses pricing IA",
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
      message: `Limite quotidienne atteinte (${limit} ${LABELS[action]}/jour pendant la beta). Réessayez demain.`,
    }
  }
  return { ok: true, used: data, limit }
}
