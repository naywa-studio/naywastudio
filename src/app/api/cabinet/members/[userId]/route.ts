import { NextResponse, type NextRequest } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { getAdminSupabase } from "@/lib/admin-supabase"

/**
 * DELETE /api/cabinet/members/:userId
 *
 * Owner-only. Removes a member from the cabinet:
 *   - the target must be a member of the same organization
 *   - the owner can't remove themselves (they must use /api/cabinet
 *     DELETE for the cabinet-wide deletion / grace-period flow)
 *
 * The target's auth.users + profile are deleted. ON DELETE CASCADE on
 * the org wipes anything they were the user_id author of (although
 * data is org-scoped, the user_id audit column hangs on rows). The
 * freed seat is immediately reusable for a new invite, at no extra
 * cost during the paid period.
 */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ userId: string }> }) {
  const { userId: targetUserId } = await ctx.params
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })

  if (user.id === targetUserId) {
    return NextResponse.json({
      error: "Pour supprimer votre propre compte, utilisez la zone de danger du cabinet.",
    }, { status: 400 })
  }

  const { data: caller } = await sb
    .from("profiles")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .single()

  if (!caller?.organization_id) {
    return NextResponse.json({ error: "No organization" }, { status: 404 })
  }
  if (caller.role !== "owner") {
    return NextResponse.json({ error: "Only the owner can remove members" }, { status: 403 })
  }

  const admin = getAdminSupabase()

  // Target must belong to the same org. Reading via admin since profile
  // RLS is org-scoped, which is fine — we still scope here explicitly.
  const { data: target } = await admin
    .from("profiles")
    .select("user_id, organization_id, role")
    .eq("user_id", targetUserId)
    .maybeSingle()

  if (!target || target.organization_id !== caller.organization_id) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 })
  }
  if (target.role === "owner") {
    return NextResponse.json({ error: "Cannot remove the owner" }, { status: 403 })
  }

  // Delete the auth user — the cascade ON profiles.user_id (which
  // references auth.users) drops the profile too.
  const { error: authErr } = await admin.auth.admin.deleteUser(targetUserId)
  if (authErr) {
    console.error("[/api/cabinet/members DELETE]", authErr)
    return NextResponse.json({ error: "Auth deletion failed" }, { status: 500 })
  }

  // Belt: if the cascade didn't fire for some reason, force-delete the
  // profile row. Idempotent — no row, no error.
  await admin.from("profiles").delete().eq("user_id", targetUserId)

  return NextResponse.json({ ok: true })
}
