import { NextResponse, type NextRequest } from "next/server"
import { getAdminSupabase } from "@/lib/admin-supabase"

export const runtime = "nodejs"

/**
 * GET /api/cron/wipe-lockdown-data
 *
 * Cron quotidien (séparé du wipe full-org). Cible les orgs entrées en
 * lockdown il y a 15 jours ou plus sans avoir régularisé. Wipe les
 * données business — candidats, missions, matches, mails, clusters,
 * usage, interviews — mais GARDE l'org, les profiles, auth.users, et
 * les invitations.
 *
 * Pourquoi pas un wipe full ? L'user a payé un jour, peut payer demain.
 * On veut qu'il puisse se reconnecter, re-souscrire, et repartir
 * d'un workspace vide sans avoir à recréer son compte. Le wipe full
 * n'arrive que sur résiliation explicite (/api/cabinet DELETE +
 * pending_deletion_at + cron/wipe-expired-orgs).
 *
 * Auth : Bearer CRON_SECRET (idem autres crons).
 */

const LOCKDOWN_GRACE_DAYS = 15

interface OrgRow {
  id: string
  name: string
  subscription_status: string | null
  lockdown_started_at: string
}

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const secret = (process.env.CRON_SECRET ?? "").trim()
  const provided = req.headers.get("authorization") ?? ""
  if (!secret || provided !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const admin = getAdminSupabase()
  const cutoff = new Date(Date.now() - LOCKDOWN_GRACE_DAYS * 24 * 60 * 60 * 1000).toISOString()

  // Orgs en lockdown depuis >= 15j et toujours pas régularisées.
  // Une org en lockdown qui re-souscrit voit son lockdown_started_at
  // cleared par le webhook -> elle ne match pas ce filtre.
  const { data: orgs, error: listErr } = await admin
    .from("organizations")
    .select("id, name, subscription_status, lockdown_started_at")
    .not("lockdown_started_at", "is", null)
    .lte("lockdown_started_at", cutoff)
  if (listErr) {
    console.error("[cron/wipe-lockdown] list:", listErr)
    return NextResponse.json({ error: "list failed" }, { status: 500 })
  }

  const wiped: Array<{ org_id: string; org_name: string; counts: Record<string, number> }> = []
  const errors: Array<{ org_id: string; step: string; message: string }> = []

  for (const org of (orgs ?? []) as OrgRow[]) {
    const counts: Record<string, number> = {}

    // Tables à wiper par ordre — on n'inclut PAS profiles, auth.users
    // ni org_invites, gardés pour permettre le retour.
    const tablesToWipe = [
      "candidates",
      "jobs",
      "match_assessments",
      "email_messages",
      "cluster_manifests",
      "daily_usage",
      "interviews",
    ] as const

    for (const table of tablesToWipe) {
      const { error: delErr, count } = await admin
        .from(table)
        .delete({ count: "exact" })
        .eq("organization_id", org.id)
      if (delErr) {
        console.error(`[cron/wipe-lockdown] ${org.id} ${table}:`, delErr)
        errors.push({ org_id: org.id, step: `delete_${table}`, message: delErr.message })
      } else {
        counts[table] = count ?? 0
      }
    }

    // Clear le lockdown_started_at — les données sont gone, on ne va
    // pas re-wiper. L'org garde son status sub (past_due / canceled).
    // seats_total et subscription_seats remis à 0 pour reset l'UI.
    const { error: updErr } = await admin
      .from("organizations")
      .update({
        lockdown_started_at: null,
        seats_total: 0,
        subscription_seats: null,
      })
      .eq("id", org.id)
    if (updErr) {
      console.error(`[cron/wipe-lockdown] update org ${org.id}:`, updErr)
      errors.push({ org_id: org.id, step: "update_org", message: updErr.message })
    }

    wiped.push({ org_id: org.id, org_name: org.name, counts })
  }

  return NextResponse.json({
    ok: true,
    ran_at: new Date().toISOString(),
    orgs_wiped: wiped.length,
    detail: wiped,
    errors,
  })
}
