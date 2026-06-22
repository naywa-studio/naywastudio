/**
 * GET /api/cron/migrate-cv-to-r2
 *
 * Cron quotidien (Vercel, 04:00 UTC) qui migre automatiquement les
 * anciens CV (encore stockés sur Supabase Storage) vers Cloudflare R2.
 *
 * Comportement :
 *   - Identifie les candidats avec un cv_file_path ou anonymized_pdf_path
 *     qui ne commence PAS par {org_id}/ (= ancien format pré-migration)
 *   - Pour chaque, download Supabase → upload R2 → update path en DB →
 *     supprime de Supabase Storage (libère le quota Free 1 GB)
 *   - Batch de 200 candidats max par run. Tant qu'il en reste, le cron
 *     du lendemain prendra le relais. Idempotent.
 *   - Une fois tout migré, le cron tourne pour rien (ne fait rien) —
 *     pas un problème de coût (1 SELECT vide par jour).
 *
 * Lazy migration en complément : les routes /api/cv/[id]/signed-url et
 * /parse migrent à la volée si elles tombent sur un fichier non-migré.
 * Du coup même sans attendre le cron, les fichiers ouverts par les
 * users sont migrés au premier accès.
 *
 * Auth : Bearer CRON_SECRET.
 */

import { NextResponse, type NextRequest } from "next/server"
import { getAdminSupabase } from "@/lib/admin-supabase"
import { r2Upload } from "@/lib/r2-storage"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const BATCH_SIZE = 200

export async function GET(req: NextRequest) {
  const secret = (process.env.CRON_SECRET ?? "").trim()
  const provided = req.headers.get("authorization") ?? ""
  if (!secret || provided !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const admin = getAdminSupabase()

  // On lit large (BATCH_SIZE * 4) puis on filtre en code — Postgres ne
  // peut pas comparer LIKE org_id::text directement de manière efficace
  // sur un index. Sur 17 candidats c'est instantané ; sur 10k on filtre
  // ~10k rows en mémoire, toujours rapide.
  const { data: candidates, error } = await admin
    .from("candidates")
    .select("id, organization_id, cv_file_path, anonymized_pdf_path, cv_mime_type")
    .not("cv_file_path", "is", null)
    .limit(BATCH_SIZE * 4)

  if (error) {
    console.error("[cron/migrate-cv-to-r2] list error:", error.message)
    return NextResponse.json({ error: "db_error" }, { status: 500 })
  }

  const toMigrate = (candidates ?? []).filter((c) => {
    if (!c.organization_id) return false
    const cvNeeds = c.cv_file_path && !c.cv_file_path.startsWith(c.organization_id + "/")
    const anonNeeds = c.anonymized_pdf_path && !c.anonymized_pdf_path.startsWith(c.organization_id + "/")
    return cvNeeds || anonNeeds
  }).slice(0, BATCH_SIZE)

  if (toMigrate.length === 0) {
    return NextResponse.json({ done: true, examined: candidates?.length ?? 0, migrated: 0 })
  }

  let cvMigrated = 0
  let anonMigrated = 0
  const errors: { candidate_id: string; msg: string }[] = []

  for (const cand of toMigrate) {
    const orgId = cand.organization_id

    // CV original.
    if (cand.cv_file_path && !cand.cv_file_path.startsWith(orgId + "/")) {
      try {
        const { data: blob, error: dlErr } = await admin.storage
          .from("cv-uploads")
          .download(cand.cv_file_path)
        if (dlErr || !blob) throw new Error(`download_cv: ${dlErr?.message ?? "missing"}`)
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
        cvMigrated++
      } catch (err) {
        errors.push({ candidate_id: cand.id, msg: err instanceof Error ? err.message : "cv_failed" })
      }
    }

    // PDF anonymisé.
    if (cand.anonymized_pdf_path && !cand.anonymized_pdf_path.startsWith(orgId + "/")) {
      try {
        const { data: blob, error: dlErr } = await admin.storage
          .from("cv-uploads")
          .download(cand.anonymized_pdf_path)
        if (dlErr || !blob) throw new Error(`download_anon: ${dlErr?.message ?? "missing"}`)
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
        anonMigrated++
      } catch (err) {
        errors.push({ candidate_id: cand.id, msg: err instanceof Error ? err.message : "anon_failed" })
      }
    }
  }

  return NextResponse.json({
    done: false,
    examined: candidates?.length ?? 0,
    batch_size: toMigrate.length,
    cv_migrated: cvMigrated,
    anonymized_migrated: anonMigrated,
    errors_count: errors.length,
    errors: errors.slice(0, 20),
  })
}
