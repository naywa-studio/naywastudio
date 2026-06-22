/**
 * GET /api/cron/reset-llm-quota
 *
 * Cron mensuel (Vercel, le 1er à 00:05 UTC). Reset les compteurs
 * `llm_actions_this_month` à 0 et bump `llm_period_start` au 1er
 * du mois courant pour toutes les orgs.
 *
 * Filet de sécurité : si ce cron rate un mois (downtime Vercel, etc.),
 * la fonction consumeOrgLlmAction() détecte le décalage llm_period_start
 * et reset à la volée. Ce cron sert juste à harmoniser tous les comptes
 * en début de mois pour les stats / dashboards.
 *
 * Auth : Bearer CRON_SECRET.
 */

import { NextResponse, type NextRequest } from "next/server"
import { getAdminSupabase } from "@/lib/admin-supabase"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const secret = (process.env.CRON_SECRET ?? "").trim()
  const provided = req.headers.get("authorization") ?? ""
  if (!secret || provided !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const admin = getAdminSupabase()

  const now = new Date()
  const periodStart = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`

  const { error, count } = await admin
    .from("organizations")
    .update({
      llm_actions_this_month: 0,
      llm_period_start: periodStart,
    }, { count: "exact" })
    .lt("llm_period_start", periodStart)
    .is("pending_deletion_at", null)

  if (error) {
    console.error("[cron/reset-llm-quota] update error:", error.message)
    return NextResponse.json({ error: "db_error" }, { status: 500 })
  }

  return NextResponse.json({ reset_count: count ?? 0, period_start: periodStart })
}
