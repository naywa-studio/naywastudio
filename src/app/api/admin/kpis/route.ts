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
 *  - mrr_estimated_eur   : somme de monthlyTotalEur(seats, has_pricing) pour
 *                          les orgs avec subscription_status IN
 *                          ('active','trialing') et un nombre de sièges connu.
 *
 * Tout passe par le client admin (bypass RLS) parce qu'on veut des
 * agrégats globaux, pas org-scoped.
 */

import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/admin"
import { getAdminSupabase } from "@/lib/admin-supabase"
import { monthlyTotalEur } from "@/lib/stripe"

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
    // MRR : on tire les lignes pour faire la somme côté code (le barème
    // dégressif vit en TS, c'est plus fiable qu'un CASE WHEN SQL).
    admin.from("organizations")
      .select("subscription_seats, subscription_has_pricing, subscription_status")
      .in("subscription_status", ["active", "trialing"]),
  ])

  // Le montant se recalcule depuis le barème (sièges + option), au lieu d'être
  // lu dans une table figée par palier : un abonnement à 7 sièges se valorise
  // désormais correctement, alors que l'ancien parsing du lookup_key ne
  // connaissait que 1..4 et le laissait tomber silencieusement du MRR.
  let mrrEur = 0
  for (const row of subActive.data ?? []) {
    if (row.subscription_seats == null) continue
    mrrEur += monthlyTotalEur(row.subscription_seats, row.subscription_has_pricing === true)
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
