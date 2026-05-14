/**
 * POST /api/cv/upload  (multipart/form-data, field: "file")
 *
 *   1. Auth check
 *   2. Validate (PDF, ≤10 MB)
 *   3. Enforce daily quota (consumeQuota — daily_usage)
 *   4. Insert candidate row (parse_status = "parsing")
 *   5. Upload PDF to Storage at {user_id}/{candidate_id}/{filename}
 *   6. Return the candidate row immediately.
 *
 * The actual PDF→text→LLM parsing happens in /api/cv/parse, which the
 * client fires fire-and-forget right after this returns. The realtime
 * channel on `candidates` then pushes the parsed row to the UI.
 */

import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { getAdminSupabase } from "@/lib/admin-supabase"
import { consumeQuota } from "@/lib/quota"

export const runtime = "nodejs"
export const maxDuration = 30 // upload + storage write — plenty even on Hobby

const MAX_BYTES = 10 * 1024 * 1024

export async function POST(req: NextRequest) {
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })

  const form = await req.formData().catch(() => null)
  const file = form?.get("file")
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "missing_file" }, { status: 400 })
  }
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json({ error: "invalid_type", message: "Seuls les PDF sont acceptés." }, { status: 400 })
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "empty_file" }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "too_large", message: "Fichier > 10 Mo." }, { status: 400 })
  }

  const admin = getAdminSupabase()
  const quota = await consumeQuota(admin, user.id, "upload")
  if (!quota.ok) {
    return NextResponse.json({ error: "quota_exceeded", message: quota.message }, { status: 429 })
  }

  const { data: created, error: insertErr } = await admin
    .from("candidates")
    .insert({
      user_id: user.id,
      cv_file_name: file.name,
      cv_file_size: file.size,
      cv_mime_type: file.type || "application/pdf",
      parse_status: "parsing",
    })
    .select("*")
    .single()

  if (insertErr || !created) {
    return NextResponse.json({ error: "db_insert_failed", detail: insertErr?.message }, { status: 500 })
  }

  const arrayBuf = await file.arrayBuffer()
  const buf = Buffer.from(arrayBuf)

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120) || "cv.pdf"
  const storagePath = `${user.id}/${created.id}/${safeName}`
  const { error: uploadErr } = await admin.storage
    .from("cv-uploads")
    .upload(storagePath, buf, { contentType: "application/pdf", upsert: false })

  if (uploadErr) {
    await admin.from("candidates").update({
      parse_status: "error",
      parse_error: `Upload Storage: ${uploadErr.message}`,
    }).eq("id", created.id)
    return NextResponse.json({ error: "storage_upload_failed", detail: uploadErr.message }, { status: 500 })
  }

  const { data: withPath } = await admin
    .from("candidates")
    .update({ cv_file_path: storagePath })
    .eq("id", created.id)
    .select("*")
    .single()

  return NextResponse.json({
    ok: true,
    candidate: withPath ?? created,
  })
}
