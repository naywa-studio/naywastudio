/**
 * DELETE /api/cv/:id  — remove a candidate (DB row + R2 objects).
 *
 * Décrémente storage_used_bytes pour refléter l'espace libéré (le cron
 * nightly recalculera la vraie valeur en tout cas, mais on évite que la
 * jauge "lag" une journée).
 */

import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { requireActiveAccess } from "@/lib/access-guard"
import { getAdminSupabase } from "@/lib/admin-supabase"
import { r2GetSize, r2SumSizeByPrefix } from "@/lib/r2-storage"
import { decrementStorageUsed } from "@/lib/quota"

export const runtime = "nodejs"

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })
  const gate = await requireActiveAccess()
  if (!gate.ok) return gate.response

  // Verify access via user-scoped client. RLS is org-scoped (migration
  // 019), so a returned row proves the caller is in the same org as
  // the candidate — which is the required permission.
  const { data: candidate, error: fetchErr } = await sb
    .from("candidates")
    .select("id, organization_id, cv_file_path, anonymized_pdf_path")
    .eq("id", id)
    .single()

  if (fetchErr || !candidate) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }

  const admin = getAdminSupabase()
  const orgId = candidate.organization_id

  // Compte la taille totale du dossier candidat sur R2 avant suppression
  // pour décrémenter le compteur stockage de la bonne valeur.
  let bytesFreed = 0
  if (candidate.cv_file_path && orgId) {
    const folder = candidate.cv_file_path.split("/").slice(0, 2).join("/")  // {org_id}/{cand_id}
    try {
      bytesFreed = await r2SumSizeByPrefix("cv", folder + "/")
    } catch {
      // Si on échoue à lister, fallback : taille du seul fichier principal.
      try { bytesFreed = await r2GetSize({ bucket: "cv", path: candidate.cv_file_path, callerOrgId: orgId }) }
      catch { /* ignore */ }
    }
    // Supprime tous les fichiers du dossier candidat (CV original +
    // PDF anonymisé + DOCX + futurs artefacts).
    const { S3Client, ListObjectsV2Command, DeleteObjectCommand } = await import("@aws-sdk/client-s3")
    const client = new S3Client({
      region: "auto",
      endpoint: process.env.R2_ENDPOINT,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
      },
    })
    try {
      const list = await client.send(new ListObjectsV2Command({ Bucket: "naywa-cv", Prefix: folder + "/" }))
      for (const obj of list.Contents ?? []) {
        if (obj.Key) await client.send(new DeleteObjectCommand({ Bucket: "naywa-cv", Key: obj.Key }))
      }
    } catch (err) {
      console.error("[cv/delete] R2 cleanup error:", err instanceof Error ? err.message : "unknown")
      // On continue quand même la suppression DB — le cron nightly
      // recalcule storage_used_bytes en listant R2.
    }
  } else if (candidate.cv_file_path) {
    // Fallback : ancien path Supabase Storage (avant migration R2).
    await admin.storage.from("cv-uploads").remove([candidate.cv_file_path])
  }

  const { error: delErr } = await admin.from("candidates").delete().eq("id", candidate.id)
  if (delErr) {
    console.error("[cv/delete] db error:", delErr.message)
    return NextResponse.json({ error: "db_delete_failed" }, { status: 500 })
  }

  if (orgId && bytesFreed > 0) {
    await decrementStorageUsed(admin, orgId, bytesFreed)
  }

  return NextResponse.json({ ok: true })
}
