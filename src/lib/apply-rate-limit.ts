/**
 * Limitation de débit du formulaire public de candidature.
 *
 * Store persistant obligatoire (pas de compteur en mémoire) : chaque
 * invocation Vercel peut être une instance froide différente, un compteur
 * en mémoire ne compterait quasiment rien. Table `public_form_submissions`
 * (migration 104), déjà nécessaire comme trace d'audit.
 *
 * Deux fenêtres, par IP (pas par email — un candidat honnête n'a qu'une IP
 * à un instant donné, mais un abuseur change d'email à volonté) :
 *   - 5 soumissions / heure
 *   - 15 soumissions / jour
 * Valeurs volontairement généreuses (un cybercafé, un point d'accès partagé
 * ne doit pas bloquer un candidat légitime) — pas une garantie anti-bot
 * sophistiquée, juste un frein contre un script qui boucle.
 */

import { createHash } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "./database.types"

const HOUR_LIMIT = 5
const DAY_LIMIT = 15

/** IP → hash irréversible. Ne jamais stocker l'IP en clair (donnée
 *  personnelle) — seul le comptage nous intéresse. */
export function hashIp(ip: string): string {
  const salt = (process.env.CANDIDATE_PRIVACY_TOKEN_SECRET ?? process.env.CRON_SECRET ?? "naywa").trim()
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex")
}

/** Extrait l'IP appelante depuis les en-têtes (Vercel pose x-forwarded-for). */
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for")
  if (fwd) return fwd.split(",")[0]!.trim()
  return req.headers.get("x-real-ip") ?? "unknown"
}

export interface RateLimitResult {
  ok: boolean
  reason?: "hour" | "day"
}

export async function checkApplyRateLimit(
  admin: SupabaseClient<Database>,
  ipHash: string,
): Promise<RateLimitResult> {
  const now = Date.now()
  const hourAgo = new Date(now - 60 * 60 * 1000).toISOString()
  const dayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString()

  const [{ count: hourCount }, { count: dayCount }] = await Promise.all([
    admin.from("public_form_submissions").select("id", { count: "exact", head: true })
      .eq("ip_hash", ipHash).eq("status", "accepted").gte("created_at", hourAgo),
    admin.from("public_form_submissions").select("id", { count: "exact", head: true })
      .eq("ip_hash", ipHash).eq("status", "accepted").gte("created_at", dayAgo),
  ])

  if ((hourCount ?? 0) >= HOUR_LIMIT) return { ok: false, reason: "hour" }
  if ((dayCount ?? 0) >= DAY_LIMIT) return { ok: false, reason: "day" }
  return { ok: true }
}
