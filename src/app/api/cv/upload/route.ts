/**
 * POST /api/cv/upload  (multipart/form-data, field: "file")
 *
 *   1. Auth check
 *   2. Validate (PDF, ≤10 MB)
 *   3. Enforce daily quota (cv_upload_quota)
 *   4. Insert candidate row (parse_status = "parsing")
 *   5. Upload PDF to Storage at {user_id}/{candidate_id}/{filename}
 *   6. Extract text → LLM parse → dedup check (email/phone) → update row
 *   7. Return updated row
 *
 * The parse happens inline (gpt-4o-mini ≈ 3-8s). If anything past step 5
 * fails, the row stays with parse_status="error" and a parse_error message.
 */

import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { getAdminSupabase } from "@/lib/admin-supabase"
import { CvParseError, extractPdfText, parseCvWithLlm } from "@/lib/cv-parser"
import type { ParsedCv } from "@/lib/database.types"

export const runtime = "nodejs"
export const maxDuration = 60

const DAILY_QUOTA = 50
const MAX_BYTES   = 10 * 1024 * 1024

export async function POST(req: NextRequest) {
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })

  // 1. Parse the form
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

  // 2. Quota check (admin client — quota table is per-user and we trust the auth)
  const admin = getAdminSupabase()
  const today = new Date().toISOString().slice(0, 10)
  const { data: quotaRow } = await admin
    .from("cv_upload_quota")
    .select("uploads")
    .eq("user_id", user.id)
    .eq("day", today)
    .maybeSingle()

  const used = quotaRow?.uploads ?? 0
  if (used >= DAILY_QUOTA) {
    return NextResponse.json(
      { error: "quota_exceeded", message: `Limite ${DAILY_QUOTA} CV/jour atteinte. Reset à minuit.` },
      { status: 429 },
    )
  }

  // 3. Insert pending candidate
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

  // 4. Save buffer once
  const arrayBuf = await file.arrayBuffer()
  const buf = Buffer.from(arrayBuf)

  // 5. Upload to Storage
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

  await admin.from("candidates")
    .update({ cv_file_path: storagePath })
    .eq("id", created.id)

  // 6. Increment quota (best-effort upsert)
  await admin.from("cv_upload_quota")
    .upsert(
      { user_id: user.id, day: today, uploads: used + 1 },
      { onConflict: "user_id,day" },
    )

  // 7. Parse pipeline
  let parsedCv: ParsedCv | null = null
  let rawText  = ""
  let parseError: { code: string; message: string } | null = null
  try {
    rawText = await extractPdfText(buf)
    parsedCv = await parseCvWithLlm(rawText)
  } catch (err) {
    if (err instanceof CvParseError) {
      parseError = { code: err.code, message: err.message }
    } else {
      parseError = { code: "llm_failed", message: (err as Error).message ?? "Erreur de parsing." }
    }
  }

  if (parseError) {
    await admin.from("candidates").update({
      parse_status: "error",
      parse_error: parseError.message,
      raw_text: rawText || null,
    }).eq("id", created.id)
    const { data: errRow } = await admin.from("candidates").select("*").eq("id", created.id).single()
    return NextResponse.json({
      ok: false,
      candidate: errRow,
      error: parseError.code,
      message: parseError.message,
    }, { status: 200 }) // 200 — the candidate exists, the user can retry parse / edit manually
  }

  // 8. Dedup: same email or phone for this user → mark as duplicate (soft, via tags).
  // We run two independent equality queries to avoid PostgREST .or() escaping
  // pitfalls on values that contain "+" or commas.
  let duplicateOf: string | null = null
  if (parsedCv?.email) {
    const { data: hit } = await admin
      .from("candidates")
      .select("id")
      .eq("user_id", user.id)
      .eq("email", parsedCv.email)
      .neq("id", created.id)
      .limit(1)
      .maybeSingle()
    if (hit) duplicateOf = hit.id
  }
  if (!duplicateOf && parsedCv?.phone) {
    const { data: hit } = await admin
      .from("candidates")
      .select("id")
      .eq("user_id", user.id)
      .eq("phone", parsedCv.phone)
      .neq("id", created.id)
      .limit(1)
      .maybeSingle()
    if (hit) duplicateOf = hit.id
  }

  const updatePayload = {
    parse_status: "parsed" as const,
    parse_error: null,
    parsed_at: new Date().toISOString(),
    parsed_cv: parsedCv,
    raw_text: rawText,
    full_name:        parsedCv?.full_name ?? null,
    email:            parsedCv?.email ?? null,
    phone:            parsedCv?.phone ?? null,
    location:         parsedCv?.location ?? null,
    linkedin_url:     parsedCv?.linkedin_url ?? null,
    current_title:    parsedCv?.current_title ?? null,
    current_company:  parsedCv?.current_company ?? null,
    years_experience: parsedCv?.years_experience ?? null,
    seniority_level:  parsedCv?.seniority_level ?? null,
    skills:           parsedCv?.skills ?? [],
    languages:        parsedCv?.languages ?? [],
    tags: duplicateOf ? ["doublon"] : [],
  }

  const { data: updated, error: updateErr } = await admin
    .from("candidates")
    .update(updatePayload)
    .eq("id", created.id)
    .select("*")
    .single()

  if (updateErr) {
    return NextResponse.json({ error: "db_update_failed", detail: updateErr.message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    candidate: updated,
    duplicate_of: duplicateOf,
  })
}
