/**
 * POST /api/cv/upload  (multipart/form-data, field: "file")
 *
 *   1. Auth check
 *   2. Validate (PDF, ≤10 MB)
 *   3. Enforce daily quota (consumeQuota — daily_usage, per-user/day)
 *   4. Enforce org storage quota (refus si dépasse)
 *   5. Enforce org LLM quota (refus si dépasse — parsing = action LLM)
 *   6. Insert candidate row (parse_status = "parsing")
 *   7. Upload PDF to R2 bucket naywa-cv : {org_id}/{candidate_id}/{filename}
 *   8. Bump storage_used_bytes par la vraie taille
 *   9. Return the candidate row immediately.
 *
 * The actual PDF→text→LLM parsing happens in /api/cv/parse, which the
 * client fires fire-and-forget right after this returns. The realtime
 * channel on `candidates` then pushes the parsed row to the UI.
 *
 * Naming: cv_file_path reste un path "logique" ({org_id}/{cand}/{file})
 * — c'est désormais un path R2, plus un path Supabase Storage.
 */

import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { getAdminSupabase } from "@/lib/admin-supabase"
import { isAdmin } from "@/lib/admin"
import { consumeQuota, consumeOrgLlmAction, checkStorageQuota, incrementStorageUsed } from "@/lib/quota"
import { r2Upload } from "@/lib/r2-storage"

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

  // Récupère le profile pour avoir l'org_id (paths R2 + quotas org).
  const { data: profile } = await admin
    .from("profiles")
    .select("organization_id")
    .eq("user_id", user.id)
    .maybeSingle()
  if (!profile?.organization_id) {
    return NextResponse.json({ error: "no_organization" }, { status: 400 })
  }
  const orgId = profile.organization_id

  const isAdminUser = await isAdmin(user.id)

  // Niveau 1 : daily per-user (filet anti-script).
  const quota = await consumeQuota(admin, user.id, "upload")
  if (!quota.ok) {
    return NextResponse.json({ error: "quota_exceeded", message: quota.message }, { status: 429 })
  }

  // Niveau 2 : storage org (refus dur si plein).
  const storageCheck = await checkStorageQuota(admin, orgId, file.size, { isAdmin: isAdminUser })
  if (!storageCheck.ok) {
    return NextResponse.json({
      error: storageCheck.code ?? "storage_quota_exceeded",
      message: storageCheck.message,
    }, { status: 413 })
  }

  // Niveau 3 : LLM org (le parsing CV est une action LLM).
  const llmCheck = await consumeOrgLlmAction(admin, orgId, { isAdmin: isAdminUser })
  if (!llmCheck.ok) {
    return NextResponse.json({
      error: llmCheck.code ?? "llm_quota_exceeded",
      message: llmCheck.message,
    }, { status: 429 })
  }

  // Doublon detection : même filename + même taille dans l'org = même
  // CV déjà uploadé. On évite de re-créer une candidate row + re-payer
  // le parsing LLM. Retourne le candidat existant avec duplicate=true
  // pour que l'UI puisse l'afficher comme "déjà dans le vivier".
  //
  // On NE filtre PAS les "ancien" : si le candidat trouvé avait été
  // archivé par la dédup, on le réactive (retire "ancien") plutôt que de
  // créer un doublon — ré-importer un CV le fait revenir au vivier.
  //
  // On lit jusqu'à 2 rows + prend la plus ancienne (canonique) au lieu de
  // .maybeSingle() qui PLANTE si 2+ copies existent déjà → l'ancien code
  // retombait alors sur "pas de doublon" et en recréait un 3ᵉ.
  const { data: existingDupes } = await admin
    .from("candidates")
    .select("*")
    .eq("organization_id", orgId)
    .eq("cv_file_name", file.name)
    .eq("cv_file_size", file.size)
    .order("created_at", { ascending: true })
    .limit(2)
  const existingDupe = (existingDupes ?? [])[0]
  if (existingDupe) {
    const tags = (existingDupe.tags ?? []) as string[]
    if (tags.includes("ancien")) {
      const revived = tags.filter((t) => t !== "ancien")
      const { data: up } = await admin
        .from("candidates")
        .update({ tags: revived })
        .eq("id", existingDupe.id)
        .select("*")
        .single()
      return NextResponse.json({ ok: true, duplicate: true, candidate: up ?? existingDupe })
    }
    return NextResponse.json({ ok: true, duplicate: true, candidate: existingDupe })
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
    console.error("[cv/upload] insert error:", insertErr?.message)
    return NextResponse.json({ error: "db_insert_failed" }, { status: 500 })
  }

  const arrayBuf = await file.arrayBuffer()
  const buf = Buffer.from(arrayBuf)

  // Sanitize filename pour R2 :
  //   1. Whitelist [a-zA-Z0-9._-], le reste devient "_"
  //   2. Collapse les "." consécutifs ("RANIA MASBAH CV..pdf" → "RANIA_MASBAH_CV.pdf")
  //      sinon assertOrgScopedPath rejette le path (".." = path traversal)
  //   3. Strip les "." en début ("hidden.pdf" cas pathologique)
  //   4. Cap 120 chars + fallback "cv.pdf" si vide
  const safeName = (() => {
    let n = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/\.{2,}/g, ".")
    n = n.replace(/^\.+/, "")
    return n.slice(0, 120) || "cv.pdf"
  })()
  const storagePath = `${orgId}/${created.id}/${safeName}`
  try {
    await r2Upload({
      bucket: "cv",
      path: storagePath,
      body: buf,
      contentType: "application/pdf",
      callerOrgId: orgId,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "upload_failed"
    console.error("[cv/upload] R2 error:", msg)
    await admin.from("candidates").update({
      parse_status: "error",
      parse_error: "Upload R2 failed",
    }).eq("id", created.id)
    return NextResponse.json({ error: "storage_upload_failed" }, { status: 500 })
  }

  // Bump le compteur stockage (cron nightly recalculera la vraie valeur
  // — c'est une estimation entre 2 passes du cron).
  await incrementStorageUsed(admin, orgId, file.size)

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
