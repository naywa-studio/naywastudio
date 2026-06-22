/**
 * GET /api/quota
 *
 * Renvoie les quotas + l'usage actuel de l'organisation du caller.
 * Utilisé par les jauges côté UI (workspace + organisation).
 *
 * Lecture : tous les members de l'org peuvent lire (visibilité partagée
 * sur le quota — le sourceur veut savoir si ça va exploser à son
 * prochain upload).
 */

import { NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { getAdminSupabase } from "@/lib/admin-supabase"
import { getQuotas } from "@/lib/quota-tiers"
import { isAdmin } from "@/lib/admin"

export const runtime = "nodejs"

export async function GET() {
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })

  const admin = getAdminSupabase()
  const { data: profile } = await admin
    .from("profiles")
    .select("organization_id")
    .eq("user_id", user.id)
    .maybeSingle()
  if (!profile?.organization_id) {
    return NextResponse.json({ error: "no_organization" }, { status: 400 })
  }

  const { data: org } = await admin
    .from("organizations")
    .select("subscription_status, subscription_price_lookup, trial_ends_at, lockdown_started_at, current_period_end, quota_override_json, storage_used_bytes, llm_actions_this_month, llm_period_start")
    .eq("id", profile.organization_id)
    .maybeSingle()
  if (!org) {
    return NextResponse.json({ error: "no_organization" }, { status: 404 })
  }

  const adminFlag = await isAdmin(user.id)
  const quotas = getQuotas(org, { isAdmin: adminFlag })

  return NextResponse.json({
    storage: {
      used_bytes: org.storage_used_bytes ?? 0,
      limit_bytes: quotas.storageBytes,
    },
    llm: {
      used: org.llm_actions_this_month ?? 0,
      limit: quotas.llmMonthly,
      period_start: org.llm_period_start,
    },
    plan: {
      source: quotas.source,
      label: quotas.label,
    },
  })
}
