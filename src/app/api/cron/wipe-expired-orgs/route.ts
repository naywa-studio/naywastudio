import { NextResponse, type NextRequest } from "next/server"
import { getAdminSupabase } from "@/lib/admin-supabase"

/**
 * GET /api/cron/wipe-expired-orgs
 *
 * Daily Vercel cron that finalises the deferred-deletion flow:
 *
 *   1. Find every org with `pending_deletion_at <= now()`
 *   2. For each:
 *        - Read the logo path (so we can delete it from storage)
 *        - Read every member's user_id (so we can drop their auth.users)
 *        - Delete the org row — cascade FKs wipe candidates, jobs,
 *          matches, daily_usage, email_messages, org_invites, profiles
 *        - Remove the logo from storage
 *        - Delete each member from auth.users via admin
 *   3. Return a summary so logs/Vercel show how much was wiped
 *
 * Auth: Vercel cron sends `Authorization: Bearer ${CRON_SECRET}` based
 * on the env var of the same name. We reject everything else, so the
 * endpoint stays callable only by Vercel (or manually by an operator
 * who knows the secret).
 */

interface OrgRow {
  id: string
  name: string
  brand_logo_path: string | null
  pending_deletion_at: string
}

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const secret = (process.env.CRON_SECRET ?? "").trim()
  const provided = req.headers.get("authorization") ?? ""
  if (!secret || provided !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const admin = getAdminSupabase()
  const now = new Date().toISOString()

  // 1. List orgs past their deletion deadline.
  const { data: orgs, error: listErr } = await admin
    .from("organizations")
    .select("id, name, brand_logo_path, pending_deletion_at")
    .not("pending_deletion_at", "is", null)
    .lte("pending_deletion_at", now)
  if (listErr) {
    console.error("[cron/wipe] list orgs:", listErr)
    return NextResponse.json({ error: "list failed" }, { status: 500 })
  }

  const wiped: Array<{ org_id: string; org_name: string; members_deleted: number; logo_deleted: boolean }> = []
  const errors: Array<{ org_id: string; step: string; message: string }> = []

  for (const org of (orgs ?? []) as OrgRow[]) {
    // 2a. Gather member user_ids before the cascade (we need them to
    //     drop the auth.users rows separately — auth.users has no FK
    //     into our tables, so the cascade doesn't reach there).
    const { data: members } = await admin
      .from("profiles")
      .select("user_id")
      .eq("organization_id", org.id)
    const memberIds = (members ?? []).map((m) => m.user_id as string)

    // 2b. Delete the org row — cascade wipes everything in public.*
    const { error: delErr } = await admin
      .from("organizations")
      .delete()
      .eq("id", org.id)
    if (delErr) {
      console.error(`[cron/wipe] delete org ${org.id}:`, delErr)
      errors.push({ org_id: org.id, step: "delete_org", message: delErr.message })
      continue
    }

    // 2c. Best-effort logo cleanup. If this fails, don't roll back the
    //     org deletion — the data is gone, the orphan file is acceptable.
    let logoDeleted = false
    if (org.brand_logo_path) {
      const { error: storageErr } = await admin.storage
        .from("brand-logos")
        .remove([org.brand_logo_path])
      if (storageErr) {
        console.warn(`[cron/wipe] storage cleanup ${org.brand_logo_path}:`, storageErr)
      } else {
        logoDeleted = true
      }
    }

    // 2d. Drop each member's auth.users entry (separate from public.*
    //     cascade). Best-effort — if one user fails to delete we keep
    //     going for the rest.
    let membersDeleted = 0
    for (const userId of memberIds) {
      const { error: userErr } = await admin.auth.admin.deleteUser(userId)
      if (userErr) {
        console.warn(`[cron/wipe] auth delete ${userId}:`, userErr)
        errors.push({ org_id: org.id, step: "delete_auth_user", message: userErr.message })
      } else {
        membersDeleted += 1
      }
    }

    wiped.push({
      org_id: org.id,
      org_name: org.name,
      members_deleted: membersDeleted,
      logo_deleted: logoDeleted,
    })
  }

  return NextResponse.json({
    ok: true,
    ran_at: now,
    orgs_wiped: wiped.length,
    members_deleted: wiped.reduce((s, w) => s + w.members_deleted, 0),
    detail: wiped,
    errors,
  })
}
