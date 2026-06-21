/**
 * PATCH / DELETE /api/admin/maj/:id
 *
 * Édition d'une nouveauté (PATCH) ou suppression (DELETE). Admin-only.
 *
 * PATCH accepte une allowlist : title, body, category, publish (toggle
 * vers publié maintenant), unpublish (toggle vers brouillon).
 *
 * DELETE supprime. Pas de soft-delete — une update non pertinente,
 * on l'éteint vraiment.
 */

import { NextRequest, NextResponse } from "next/server"
import { logAdminAction, requireAdmin } from "@/lib/admin"
import { getAdminSupabase } from "@/lib/admin-supabase"
import { sanitizeAffectedPaths } from "@/lib/affected-paths"
import type { AppUpdate, AppUpdateCategory } from "@/lib/database.types"

export const runtime = "nodejs"

const VALID_CATEGORIES: AppUpdateCategory[] = ["feature", "fix", "important", "announce"]

type AppUpdatePatch = Partial<Pick<AppUpdate, "title" | "body" | "category" | "published_at" | "affected_paths">>

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.response
  const { id } = await ctx.params

  const body = await req.json().catch(() => null) as {
    title?: unknown
    body?: unknown
    category?: unknown
    publish?: unknown
    unpublish?: unknown
    affected_paths?: unknown
  } | null
  if (!body) return NextResponse.json({ error: "invalid_body" }, { status: 400 })

  // Allowlist explicite.
  const patch: AppUpdatePatch = {}
  if (typeof body.title === "string") patch.title = body.title.trim().slice(0, 200)
  if (typeof body.body === "string") patch.body = body.body.trim().slice(0, 8000)
  if (typeof body.category === "string" && VALID_CATEGORIES.includes(body.category as AppUpdateCategory)) {
    patch.category = body.category as AppUpdateCategory
  }
  if (body.publish === true) patch.published_at = new Date().toISOString()
  if (body.unpublish === true) patch.published_at = null
  // affected_paths : on accepte un array même vide (= reset à tous).
  if (Array.isArray(body.affected_paths)) {
    patch.affected_paths = sanitizeAffectedPaths(body.affected_paths)
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "nothing_to_update" }, { status: 400 })
  }

  const admin = getAdminSupabase()
  const { error } = await admin.from("app_updates").update(patch).eq("id", id)
  if (error) {
    console.error("[admin/maj] update error:", error.message)
    return NextResponse.json({ error: "db_error" }, { status: 500 })
  }

  await logAdminAction({
    adminUserId: gate.userId,
    action: "update_app_update",
    targetType: "app_update",
    targetId: id,
    metadata: { fields: Object.keys(patch) },
  })

  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.response
  const { id } = await ctx.params

  const admin = getAdminSupabase()
  const { error } = await admin.from("app_updates").delete().eq("id", id)
  if (error) {
    console.error("[admin/maj] delete error:", error.message)
    return NextResponse.json({ error: "db_error" }, { status: 500 })
  }

  await logAdminAction({
    adminUserId: gate.userId,
    action: "delete_update",
    targetType: "app_update",
    targetId: id,
  })

  return NextResponse.json({ ok: true })
}
