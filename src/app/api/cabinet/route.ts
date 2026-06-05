import { NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { getAdminSupabase } from "@/lib/admin-supabase"

/**
 * PATCH /api/cabinet
 *   Owner-only. Updates editable fields on the caller's organization.
 *   Body: { name?, brand_name?, brand_logo_path? }
 *
 * DELETE /api/cabinet
 *   Owner-only. Triggers cabinet deletion.
 *     - If the owner is alone in the org → wipe everything immediately
 *       (org cascade + auth.users + storage logo).
 *     - If other members exist → set pending_deletion_at = now() + 30 d,
 *       wipe the owner's auth.users + profile immediately. Members keep
 *       access during the grace period; the daily cron (built in a
 *       follow-up step) does the final wipe.
 */

const GRACE_DAYS = 30

interface UpdateBody {
  name?: string
  brand_name?: string | null
  brand_logo_path?: string | null
}

export async function PATCH(req: Request) {
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })

  const { data: profile } = await sb
    .from("profiles")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .single()

  if (!profile?.organization_id) {
    return NextResponse.json({ error: "No organization" }, { status: 404 })
  }
  if (profile.role !== "owner") {
    return NextResponse.json({ error: "Only the owner can edit the cabinet" }, { status: 403 })
  }

  let body: UpdateBody
  try { body = (await req.json()) as UpdateBody }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

  const patch: UpdateBody = {}
  if ("name" in body && typeof body.name === "string" && body.name.trim()) {
    patch.name = body.name.trim()
  }
  if ("brand_name" in body) {
    patch.brand_name = body.brand_name && body.brand_name.trim() ? body.brand_name.trim() : null
  }
  if ("brand_logo_path" in body) {
    patch.brand_logo_path = body.brand_logo_path && body.brand_logo_path.trim() ? body.brand_logo_path : null
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Empty patch" }, { status: 400 })
  }

  const { error } = await sb
    .from("organizations")
    .update(patch)
    .eq("id", profile.organization_id)

  if (error) {
    console.error("[/api/cabinet PATCH]", error)
    return NextResponse.json({ error: "DB error" }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE() {
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })

  const { data: profile } = await sb
    .from("profiles")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .single()

  if (!profile?.organization_id) {
    return NextResponse.json({ error: "No organization" }, { status: 404 })
  }
  if (profile.role !== "owner") {
    return NextResponse.json({ error: "Only the owner can delete the cabinet" }, { status: 403 })
  }

  const admin = getAdminSupabase()

  // Count other members in the org (excluding the owner herself).
  const { count: otherMembers } = await admin
    .from("profiles")
    .select("user_id", { count: "exact", head: true })
    .eq("organization_id", profile.organization_id)
    .neq("user_id", user.id)

  // Fetch logo path so we can clean up storage too.
  const { data: org } = await admin
    .from("organizations")
    .select("brand_logo_path")
    .eq("id", profile.organization_id)
    .single()

  if ((otherMembers ?? 0) === 0) {
    // ─ Alone in the org → wipe immediately. Cascading FK ON DELETE on
    //   organizations removes every candidate, job, match, email, invite,
    //   daily_usage row and the owner's profile.
    if (org?.brand_logo_path) {
      await admin.storage.from("brand-logos").remove([org.brand_logo_path])
    }

    const { error: orgErr } = await admin
      .from("organizations")
      .delete()
      .eq("id", profile.organization_id)
    if (orgErr) {
      console.error("[/api/cabinet DELETE solo] org delete", orgErr)
      return NextResponse.json({ error: "DB error" }, { status: 500 })
    }

    const { error: userErr } = await admin.auth.admin.deleteUser(user.id)
    if (userErr) {
      console.error("[/api/cabinet DELETE solo] auth delete", userErr)
      return NextResponse.json({ error: "Auth error" }, { status: 500 })
    }

    return NextResponse.json({ ok: true, mode: "immediate" })
  }

  // ─ Members exist → enter 30-day grace mode. The owner is removed now,
  //   the org keeps running for the others, cron wipes everything at the
  //   deadline. owner_user_id is cleared so nothing dangles.
  const deletionDate = new Date(Date.now() + GRACE_DAYS * 24 * 60 * 60 * 1000)

  const { error: orgErr } = await admin
    .from("organizations")
    .update({
      pending_deletion_at: deletionDate.toISOString(),
      package_sourcing_active: false,
      owner_user_id: null,
    })
    .eq("id", profile.organization_id)
  if (orgErr) {
    console.error("[/api/cabinet DELETE grace] org update", orgErr)
    return NextResponse.json({ error: "DB error" }, { status: 500 })
  }

  const { error: userErr } = await admin.auth.admin.deleteUser(user.id)
  if (userErr) {
    console.error("[/api/cabinet DELETE grace] auth delete", userErr)
    return NextResponse.json({ error: "Auth error" }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    mode: "grace",
    pending_deletion_at: deletionDate.toISOString(),
  })
}
