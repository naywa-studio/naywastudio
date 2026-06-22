/**
 * POST /api/admin/migrate-cv-to-r2
 *
 * Migration one-shot des CV de Supabase Storage vers Cloudflare R2.
 *
 * Pour chaque candidat avec un cv_file_path qui ne commence PAS par
 * l'org_id (ancien format `{user_id}/{cand}/...` pré-migration) :
 *   1. Download depuis Supabase Storage
 *   2. Upload sur R2 à `{org_id}/{cand_id}/{filename}`
 *   3. Update candidate.cv_file_path avec le nouveau chemin
 *   4. Supprime de Supabase Storage (libère le quota Free 1 GB)
 *
 * Idempotent : si un fichier a déjà été migré (path commence par
 * org_id), il est skippé. On peut relancer le script tant qu'on veut.
 *
 * Pareil pour anonymized_pdf_path.
 *
 * Admin-only. Body : { dry_run?: boolean, limit?: number }.
 *   - dry_run: true → ne fait rien, retourne juste la liste qui aurait été migrée
 *   - limit : nb max de candidats à migrer (default 50, pour batcher)
 *
 * Audit log : action "migrate_cv_to_r2".
 */

import { NextRequest, NextResponse } from "next/server"
import { logAdminAction, requireAdmin } from "@/lib/admin"
import { getAdminSupabase } from "@/lib/admin-supabase"
import { r2Upload } from "@/lib/r2-storage"

export const runtime = "nodejs"
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.response

  const body = await req.json().catch(() => ({} as { dry_run?: unknown; limit?: unknown }))
  const dryRun = body.dry_run === true
  const limit = typeof body.limit === "number" && body.limit > 0 ? Math.min(200, body.limit) : 50

  const admin = getAdminSupabase()

  // Liste les candidats avec un cv_file_path non encore migré.
  const { data: candidates, error } = await admin
    .from("candidates")
    .select("id, organization_id, cv_file_path, anonymized_pdf_path, cv_file_size, cv_mime_type")
    .not("cv_file_path", "is", null)
    .limit(limit)

  if (error) {
    console.error("[migrate-cv-to-r2] list error:", error.message)
    return NextResponse.json({ error: "db_error" }, { status: 500 })
  }

  type MigrationResult = {
    candidate_id: string
    cv_migrated: boolean
    anonymized_migrated: boolean
    error?: string
  }
  const results: MigrationResult[] = []
  let cvMigrated = 0
  let anonMigrated = 0

  for (const cand of candidates ?? []) {
    const orgId = cand.organization_id
    if (!orgId) {
      results.push({ candidate_id: cand.id, cv_migrated: false, anonymized_migrated: false, error: "no_org" })
      continue
    }

    const r: MigrationResult = { candidate_id: cand.id, cv_migrated: false, anonymized_migrated: false }

    // CV original.
    if (cand.cv_file_path && !cand.cv_file_path.startsWith(orgId + "/")) {
      try {
        if (!dryRun) {
          const { data: blob, error: dlErr } = await admin.storage
            .from("cv-uploads")
            .download(cand.cv_file_path)
          if (dlErr || !blob) throw new Error(`download: ${dlErr?.message ?? "unknown"}`)
          const buf = Buffer.from(await blob.arrayBuffer())

          const filename = cand.cv_file_path.split("/").pop() ?? "cv.pdf"
          const newPath = `${orgId}/${cand.id}/${filename}`
          await r2Upload({
            bucket: "cv",
            path: newPath,
            body: buf,
            contentType: cand.cv_mime_type ?? "application/pdf",
            callerOrgId: orgId,
          })
          await admin.from("candidates").update({ cv_file_path: newPath }).eq("id", cand.id)
          await admin.storage.from("cv-uploads").remove([cand.cv_file_path])
        }
        r.cv_migrated = true
        cvMigrated++
      } catch (err) {
        r.error = err instanceof Error ? err.message : "cv_failed"
      }
    }

    // PDF anonymisé (séparé pour ne pas tout casser si l'un échoue).
    if (cand.anonymized_pdf_path && !cand.anonymized_pdf_path.startsWith(orgId + "/")) {
      try {
        if (!dryRun) {
          const { data: blob, error: dlErr } = await admin.storage
            .from("cv-uploads")
            .download(cand.anonymized_pdf_path)
          if (dlErr || !blob) throw new Error(`download_anon: ${dlErr?.message ?? "unknown"}`)
          const buf = Buffer.from(await blob.arrayBuffer())

          const newPath = `${orgId}/${cand.id}/anonymized.pdf`
          await r2Upload({
            bucket: "cv",
            path: newPath,
            body: buf,
            contentType: "application/pdf",
            callerOrgId: orgId,
          })
          await admin.from("candidates").update({ anonymized_pdf_path: newPath }).eq("id", cand.id)
          await admin.storage.from("cv-uploads").remove([cand.anonymized_pdf_path])
        }
        r.anonymized_migrated = true
        anonMigrated++
      } catch (err) {
        r.error = (r.error ? r.error + "; " : "") + (err instanceof Error ? err.message : "anon_failed")
      }
    }

    results.push(r)
  }

  if (!dryRun) {
    await logAdminAction({
      adminUserId: gate.userId,
      action: "migrate_cv_to_r2",
      metadata: { cv_migrated: cvMigrated, anon_migrated: anonMigrated, batch_size: candidates?.length ?? 0 },
    })
  }

  return NextResponse.json({
    dry_run: dryRun,
    examined: candidates?.length ?? 0,
    cv_migrated: cvMigrated,
    anonymized_migrated: anonMigrated,
    results,
  })
}
