import { NextResponse, type NextRequest } from "next/server"
import { getAdminSupabase } from "@/lib/admin-supabase"

export const runtime = "nodejs"

/**
 * GET /api/cron/wipe-lockdown-data
 *
 * Cron quotidien. Wipe les DONNÉES BUSINESS (candidats, missions, matches,
 * mails, clusters, usage) des orgs "suspendues" depuis > 30 jours SANS avoir
 * régularisé, mais GARDE le compte (org, profiles, auth.users, invitations)
 * pour permettre un retour + une ré-souscription depuis un workspace vide.
 *
 * Deux causes de suspension traitées (fenêtre de grâce unifiée, cf.
 * lib/subscription.ts `graceInfo`) :
 *   1. Abonnement résilié / impayé → `lockdown_started_at` posé par le webhook.
 *   2. Essai gratuit expiré sans abonnement pris → `trial_ends_at` dans le passé
 *      (jamais souscrit). Avant cette route, ces données restaient
 *      indéfiniment — non conforme RGPD (pas de conservation sans base légale).
 *
 * Le wipe TOTAL (org + auth.users + logo) reste réservé à la suppression
 * explicite par l'owner (`pending_deletion_at` + cron/wipe-expired-orgs).
 *
 * Auth : Bearer CRON_SECRET (idem autres crons).
 */

const GRACE_DAYS = 30

const BUSINESS_TABLES = [
  "candidates",
  "jobs",
  "match_assessments",
  "email_messages",
  "cluster_manifests",
  "daily_usage",
] as const

type BusinessTable = (typeof BUSINESS_TABLES)[number]

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const secret = (process.env.CRON_SECRET ?? "").trim()
  const provided = req.headers.get("authorization") ?? ""
  if (!secret || provided !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const admin = getAdminSupabase()
  const cutoff = new Date(Date.now() - GRACE_DAYS * 24 * 60 * 60 * 1000).toISOString()

  // 1) Abonnement résilié / impayé depuis >= 30 j (lockdown posé par le webhook).
  //    Une org qui re-souscrit voit son lockdown_started_at cleared -> exclue.
  const { data: lockdownOrgs, error: lockErr } = await admin
    .from("organizations")
    .select("id, name, lockdown_started_at")
    .not("lockdown_started_at", "is", null)
    .lte("lockdown_started_at", cutoff)
  if (lockErr) {
    console.error("[cron/wipe-lockdown] list lockdown:", lockErr)
    return NextResponse.json({ error: "list failed" }, { status: 500 })
  }

  // 2) Essai expiré depuis >= 30 j, jamais souscrit, pas de suppression en cours.
  //    subscription_status null / incomplete(_expired) = n'a jamais eu d'abo
  //    actif (les past_due/unpaid/canceled ont un lockdown_started_at -> cas 1).
  const { data: trialOrgs, error: trialErr } = await admin
    .from("organizations")
    .select("id, name, trial_ends_at")
    .is("lockdown_started_at", null)
    .is("pending_deletion_at", null)
    .not("trial_ends_at", "is", null)
    .lte("trial_ends_at", cutoff)
    .or("subscription_status.is.null,subscription_status.in.(incomplete,incomplete_expired)")
  if (trialErr) {
    console.error("[cron/wipe-lockdown] list trial:", trialErr)
    return NextResponse.json({ error: "list failed" }, { status: 500 })
  }

  const targets = [
    ...(lockdownOrgs ?? []).map((o) => ({ id: o.id as string, name: o.name as string, cause: "subscription" as const })),
    ...(trialOrgs ?? []).map((o) => ({ id: o.id as string, name: o.name as string, cause: "trial" as const })),
  ]

  const wiped: Array<{ org_id: string; org_name: string; cause: string; counts: Record<string, number> }> = []
  const errors: Array<{ org_id: string; step: string; message: string }> = []

  for (const org of targets) {
    // Skip si déjà vide (évite un no-op quotidien sur les essais expirés qui
    // n'ont pas de stamp à clear). Sonde légère sur candidates.
    const { count: candCount } = await admin
      .from("candidates")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org.id)
    const { count: jobCount } = await admin
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org.id)
    if ((candCount ?? 0) === 0 && (jobCount ?? 0) === 0) {
      continue
    }

    const counts: Record<string, number> = {}
    for (const table of BUSINESS_TABLES as ReadonlyArray<BusinessTable>) {
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

    // Reset l'UI côté sièges. On ne touche PAS trial_ends_at (garde la trace)
    // ni lockdown_started_at pour un essai (reste null) ; pour un lockdown on
    // le clear (données gone, on ne re-wipe pas).
    const orgPatch: {
      seats_total: number
      subscription_seats: number | null
      lockdown_started_at?: string | null
    } = { seats_total: 0, subscription_seats: null }
    if (org.cause === "subscription") orgPatch.lockdown_started_at = null
    const { error: updErr } = await admin
      .from("organizations")
      .update(orgPatch)
      .eq("id", org.id)
    if (updErr) {
      console.error(`[cron/wipe-lockdown] update org ${org.id}:`, updErr)
      errors.push({ org_id: org.id, step: "update_org", message: updErr.message })
    }

    wiped.push({ org_id: org.id, org_name: org.name, cause: org.cause, counts })
  }

  return NextResponse.json({
    ok: true,
    ran_at: new Date().toISOString(),
    orgs_wiped: wiped.length,
    detail: wiped,
    errors,
  })
}
