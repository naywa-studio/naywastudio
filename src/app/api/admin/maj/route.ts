/**
 * /api/admin/maj  —  CRUD app_updates (admin-only)
 *
 *   GET    : liste toutes les updates (brouillons + publiées),
 *            triées par created_at desc.
 *   POST   : crée une nouvelle update (brouillon par défaut).
 *
 * Le PATCH/DELETE par id vit dans le sous-fichier [id]/route.ts.
 *
 * Field-allowlist côté POST pour éviter les spread d'inputs non-validés.
 */

import { NextRequest, NextResponse } from "next/server"
import { logAdminAction, requireAdmin } from "@/lib/admin"
import { getAdminSupabase } from "@/lib/admin-supabase"
import { sanitizeAffectedPaths } from "@/lib/affected-paths"
import type { AppUpdateCategory } from "@/lib/database.types"

export const runtime = "nodejs"

const VALID_CATEGORIES: AppUpdateCategory[] = ["feature", "fix", "important", "announce"]

export async function GET() {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.response

  const admin = getAdminSupabase()
  const { data, error } = await admin
    .from("app_updates")
    .select("id, title, body, category, published_at, author_user_id, affected_paths, created_at, updated_at")
    .order("created_at", { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ updates: data ?? [] })
}

export async function POST(req: NextRequest) {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.response

  const body = await req.json().catch(() => null) as {
    title?: unknown
    body?: unknown
    category?: unknown
    publish_now?: unknown
    affected_paths?: unknown
  } | null
  if (!body) return NextResponse.json({ error: "invalid_body" }, { status: 400 })

  const title = typeof body.title === "string" ? body.title.trim().slice(0, 200) : ""
  const bodyText = typeof body.body === "string" ? body.body.trim().slice(0, 8000) : ""
  const category: AppUpdateCategory = VALID_CATEGORIES.includes(body.category as AppUpdateCategory)
    ? (body.category as AppUpdateCategory)
    : "feature"
  const publishNow = body.publish_now === true
  const affectedPaths = sanitizeAffectedPaths(body.affected_paths)

  if (!title) return NextResponse.json({ error: "title_required" }, { status: 400 })
  if (!bodyText) return NextResponse.json({ error: "body_required" }, { status: 400 })

  const admin = getAdminSupabase()
  const { data, error } = await admin
    .from("app_updates")
    .insert({
      title,
      body: bodyText,
      category,
      published_at: publishNow ? new Date().toISOString() : null,
      author_user_id: gate.userId,
      affected_paths: affectedPaths,
    })
    .select("id")
    .single()

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "insert_failed" }, { status: 500 })
  }

  await logAdminAction({
    adminUserId: gate.userId,
    action: "publish_update",
    targetType: "app_update",
    targetId: data.id,
    metadata: { title, category, published: publishNow },
  })

  return NextResponse.json({ id: data.id, ok: true })
}
