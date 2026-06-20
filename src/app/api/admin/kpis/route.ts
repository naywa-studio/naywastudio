/**
 * GET /api/admin/kpis
 *
 * Renvoie les 6 KPIs du dashboard /admin. Admin-only.
 *
 * Source de chaque chiffre — chaque ligne ci-dessous est la requête
 * SQL qui calcule le chiffre. On évite les KPIs dérivés / ratios
 * pour ne pas mentir avec des compositions opaques.
 *
 *  - cabinets_active     : organizations WHERE pending_deletion_at IS NULL
 *  - users_total         : profiles
 *  - seats_occupied      : profiles WHERE has_sourcing_seat = true
 *  - candidates_parsed   : candidates WHERE parse_status = 'parsed'
 *  - trials_active       : organizations WHERE trial_ends_at > now()
 *  - mrr_estimated_eur   : sum( PLAN_PRICES_EUR[tier][seats] )
 *                          for orgs avec subscription_status IN
 *                          ('active','trialing') et subscription_price_lookup
 *                          parsable.
 *
 * Tout passe par le client admin (bypass RLS) parce qu'on veut des
 * agrégats globaux, pas org-scoped.
 */

import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/admin"
import { getAdminSupabase } from "@/lib/admin-supabase"
import { parseLookupKey, PLAN_PRICES_EUR } from "@/lib/stripe"

export const runtime = "nodejs"

export async function GET() {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.response

  const admin = getAdminSupabase()

  // On lance les 6 requêtes en parallèle.
  const [
    cabinetsActive,
    usersTotal,
    seatsOccupied,
    candidatesParsed,
    trialsActive,
    subActive,
  ] = await Promise.all([
    admin.from("organizations").select("id", { count: "exact", head: true })
      .is("pending_deletion_at", null),
    admin.from("profiles").select("id", { count: "exact", head: true }),
    admin.from("profiles").select("id", { count: "exact", head: true })
      .eq("has_sourcing_seat", true),
    admin.from("candidates").select("id", { count: "exact", head: true })
      .eq("parse_status", "parsed"),
    admin.from("organizations").select("id", { count: "exact", head: true })
      .gt("trial_ends_at", new Date().toISOString()),
    // MRR : on tire les lignes pour faire la somme côté code (PLAN_PRICES
    // étant en TS, c'est plus fiable que SQL CASE WHEN).
    admin.from("organizations")
      .select("subscription_price_lookup, subscription_status")
      .in("subscription_status", ["active", "trialing"]),
  ])

  let mrrEur = 0
  for (const row of subActive.data ?? []) {
    const plan = parseLookupKey(row.subscription_price_lookup)
    if (!plan) continue
    mrrEur += PLAN_PRICES_EUR[plan.tier][plan.seats]
  }

  return NextResponse.json({
    cabinets_active: cabinetsActive.count ?? 0,
    users_total: usersTotal.count ?? 0,
    seats_occupied: seatsOccupied.count ?? 0,
    candidates_parsed: candidatesParsed.count ?? 0,
    trials_active: trialsActive.count ?? 0,
    mrr_estimated_eur: Math.round(mrrEur * 100) / 100,
  })
}
