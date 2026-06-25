/**
 * GET /api/cron/reset-llm-quota
 *
 * Cron QUOTIDIEN (Vercel, 00:05 UTC). Pour chaque org abonnée dont le
 * `llm_period_start` date d'il y a >= 30 jours, reset le compteur et
 * avance la fenêtre par bonds de 30 j (au cas où le cron aurait raté
 * plusieurs passages).
 *
 * Modèle "anniversaire d'abonnement" : la période de renouvellement
 * démarre au jour d'activation de l'abonnement (stamp posé par le
 * webhook Stripe). Plus simple à expliquer au client que "le 1er du
 * mois" — et conforme à la facturation Stripe qui suit le même cycle.
 *
 * Les essais gratuits ne sont JAMAIS resetés : ils ont un pot fixe de
 * 1 700 crédits à consommer sur les 15 j (cf. lib/quota-tiers.ts).
 *
 * Filet runtime : si ce cron rate, lib/quota.ts détecte aussi le
 * décalage et reset à la volée au prochain appel LLM.
 *
 * Auth : Bearer CRON_SECRET.
 */

import { NextResponse, type NextRequest } from "next/server"
import { getAdminSupabase } from "@/lib/admin-supabase"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const RESET_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000

export async function GET(req: NextRequest) {
  const secret = (process.env.CRON_SECRET ?? "").trim()
  const provided = req.headers.get("authorization") ?? ""
  if (!secret || provided !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const admin = getAdminSupabase()
  const cutoff = new Date(Date.now() - RESET_INTERVAL_MS).toISOString()

  // Cible les orgs abonnées (pas les essais — pot unique) dont la
  // fenêtre courante est plus vieille que 30 j.
  const { data: orgs, error: listErr } = await admin
    .from("organizations")
    .select("id, llm_period_start, subscription_status")
    .in("subscription_status", ["active", "trialing"])
    .lt("llm_period_start", cutoff)
    .is("pending_deletion_at", null)

  if (listErr) {
    console.error("[cron/reset-llm-quota] list error:", listErr.message)
    return NextResponse.json({ error: "db_error" }, { status: 500 })
  }

  let resetCount = 0
  for (const org of orgs ?? []) {
    if (!org.llm_period_start) continue
    const startMs = new Date(org.llm_period_start).getTime()
    if (!Number.isFinite(startMs)) continue
    // Avance par bonds de 30 j jusqu'à tomber sur une fenêtre couvrant
    // maintenant (gère le cas où plusieurs passages ont sauté).
    let next = startMs
    while (Date.now() - next >= RESET_INTERVAL_MS) next += RESET_INTERVAL_MS
    const { error: updErr } = await admin
      .from("organizations")
      .update({
        llm_actions_this_month: 0,
        llm_period_start: new Date(next).toISOString(),
      })
      .eq("id", org.id)
    if (updErr) {
      console.error("[cron/reset-llm-quota] update error:", org.id, updErr.message)
      continue
    }
    resetCount += 1
  }

  return NextResponse.json({
    ran_at: new Date().toISOString(),
    candidates: orgs?.length ?? 0,
    reset_count: resetCount,
  })
}
