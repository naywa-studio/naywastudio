/**
 * PATCH  /api/profile/brand  { brand_name?: string | null }
 *   - updates the brand name shown on anonymised CVs
 *
 * POST   /api/profile/brand                (multipart: file=<image>)
 *   - uploads the brand logo into the brand-logos bucket and stores the
 *     path on the profile. Replaces any previous logo.
 *
 * DELETE /api/profile/brand
 *   - removes the stored logo (file + path), keeps the brand_name.
 */

import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { getAdminSupabase } from "@/lib/admin-supabase"

export const runtime = "nodejs"
export const maxDuration = 15

const MAX_BYTES = 2 * 1024 * 1024 // 2 MB
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"]

export async function PATCH(req: NextRequest) {
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })

  const body = await req.json().catch(() => null) as { brand_name?: unknown } | null
  if (!body || !("brand_name" in body)) {
    return NextResponse.json({ error: "bad_body" }, { status: 400 })
  }
  const name = typeof body.brand_name === "string" ? body.brand_name.trim().slice(0, 80) : null
  const value = name && name.length > 0 ? name : null

  const { error } = await sb.from("profiles").update({ brand_name: value }).eq("user_id", user.id)
  if (error) return NextResponse.json({ error: "db_failed", detail: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, brand_name: value })
}

export async function POST(req: NextRequest) {
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })

  const form = await req.formData().catch(() => null)
  const file = form?.get("file")
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "no_file" }, { status: 400 })
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "bad_format", message: "Logo : PNG, JPG, WEBP ou SVG uniquement." }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "too_large", message: "Logo > 2 Mo." }, { status: 400 })
  }

  const admin = getAdminSupabase()

  // Delete any previous logo so we don't accumulate orphaned files.
  const { data: existing } = await sb.from("profiles")
    .select("brand_logo_path").eq("user_id", user.id).maybeSingle()
  if (existing?.brand_logo_path) {
    await admin.storage.from("brand-logos").remove([existing.brand_logo_path]).catch(() => {})
  }

  const ext = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "png"
  const path = `${user.id}/logo-${Date.now()}.${ext}`
  const arrayBuffer = await file.arrayBuffer()

  const { error: upErr } = await admin.storage.from("brand-logos").upload(path, arrayBuffer, {
    contentType: file.type,
    upsert: false,
  })
  if (upErr) {
    return NextResponse.json({ error: "storage_failed", detail: upErr.message }, { status: 500 })
  }

  await admin.from("profiles").update({ brand_logo_path: path }).eq("user_id", user.id)
  return NextResponse.json({ ok: true, brand_logo_path: path })
}

export async function DELETE() {
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })

  const admin = getAdminSupabase()
  const { data: existing } = await sb.from("profiles")
    .select("brand_logo_path").eq("user_id", user.id).maybeSingle()
  if (existing?.brand_logo_path) {
    await admin.storage.from("brand-logos").remove([existing.brand_logo_path]).catch(() => {})
  }
  await admin.from("profiles").update({ brand_logo_path: null }).eq("user_id", user.id)
  return NextResponse.json({ ok: true })
}
