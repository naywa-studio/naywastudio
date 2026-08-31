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
    candidatesByMonth,
  ] = await Promise.all([
    admin.from("organizations")
     .select("id", { count: "exact", head: true })
     .is("pending_deletion_at", null)
     .eq("is_test", false),

    admin.from("profiles")
     .select("id, organizations!inner(is_test)", { count: "exact", head: true })
     .eq("organizations.is_test", false),

    admin.from("profiles")
     .select("id, organizations!inner(is_test)", { count: "exact", head: true })
     .eq("has_sourcing_seat", true)
     .eq("organizations.is_test", false),

    admin.from("candidates")
     .select("id, organizations!inner(is_test)", { count: "exact", head: true })
     .eq("parse_status", "parsed")
     .eq("organizations.is_test", false),

    admin.from("organizations")
     .select("id", { count: "exact", head: true })
     .gt("trial_ends_at", new Date().toISOString())
     .eq("is_test", false),
    // MRR : on tire les lignes pour faire la somme côté code (le barème
    // dégressif vit en TS, c'est plus fiable qu'un CASE WHEN SQL).
    admin.from("organizations")
      .select("subscription_seats, subscription_has_pricing, subscription_status")
      .in("subscription_status", ["active", "trialing"])
      .eq("is_test", false),
    
    admin
  .from("candidates")
  .select("created_at, organizations!inner(is_test)")
  .eq("parse_status", "parsed")
  .eq("organizations.is_test", false)
  ])
  const { data: orgTypes, error: orgTypesError } = await admin
  .from("organizations")
  .select("org_type")
  .is("pending_deletion_at", null)
  .eq("is_test", false)

if (orgTypesError) throw orgTypesError

const orgTypeCounts = {
  esn_conseil: 0,
  cabinet_recrutement: 0,
  equipe_interne: 0,
}

for (const row of orgTypes ?? []) {
  if (row.org_type === "esn_conseil") orgTypeCounts.esn_conseil++
  else if (row.org_type === "cabinet_recrutement") orgTypeCounts.cabinet_recrutement++
  else if (row.org_type === "equipe_interne") orgTypeCounts.equipe_interne++
}

  // Le montant se recalcule depuis le barème (sièges + option), au lieu d'être
  // lu dans une table figée par palier : un abonnement à 7 sièges se valorise
  // désormais correctement, alors que l'ancien parsing du lookup_key ne
  // connaissait que 1..4 et le laissait tomber silencieusement du MRR.
  let mrrEur = 0
  for (const row of subActive.data ?? []) {
    if (row.subscription_seats == null) continue
    mrrEur += monthlyTotalEur(row.subscription_seats, row.subscription_has_pricing === true)
  }

  const monthMap = new Map<string, number>()

for (const row of candidatesByMonth.data ?? []) {
  const date = new Date(row.created_at)
  const month = date.toLocaleString("en-US", {
    month: "short",
  })

  monthMap.set(month, (monthMap.get(month) ?? 0) + 1)
}

const candidates_by_month = Array.from(monthMap.entries()).map(
  ([month, count]) => ({
    month,
    count,
  })
)

  return NextResponse.json({
    cabinets_active: cabinetsActive.count ?? 0,
    users_total: usersTotal.count ?? 0,
    seats_occupied: seatsOccupied.count ?? 0,
    candidates_parsed: candidatesParsed.count ?? 0,
    trials_active: trialsActive.count ?? 0,
    mrr_estimated_eur: Math.round(mrrEur * 100) / 100,
    org_type_counts: orgTypeCounts,
    candidates_by_month,
  })
}
