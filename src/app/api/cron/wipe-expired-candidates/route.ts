import { NextResponse, type NextRequest } from "next/server"
import { getAdminSupabase } from "@/lib/admin-supabase"
import { r2GetSize, r2SumSizeByPrefix, r2DeleteByPrefix } from "@/lib/r2-storage"
import { decrementStorageUsed } from "@/lib/quota"
import { verifyCronSecret } from "@/lib/cron-auth"

export const runtime = "nodejs"
export const maxDuration = 60
export const dynamic = "force-dynamic"

/**
 * GET /api/cron/wipe-expired-candidates
 *
 * Cron quotidien. Purge RGPD candidat-par-candidat : R2 (CV + PDF anonymisé)
 * + la ligne `candidates`, pour tout candidat dont `retention_until` est
 * dépassé. `retention_until` est posé/recalculé par les triggers de la
 * migration 098 (jamais écrit à la main côté app) — cette route ne fait que
 * lire la colonne et exécuter la même suppression que
 * `DELETE /api/cv/[id]` (cf. ce fichier pour le détail du nettoyage R2).
 *
 * NULL = jamais purgé automatiquement (candidats pré-existants à la
 * migration 098, tant qu'ils n'ont pas été retouchés — voir sa note).
 *
 * Batch plafonné (comme migrate-cv-to-r2) pour rester sous maxDuration ;
 * un run qui laisse des candidats derrière sera repris le lendemain.
 *
 * Auth : Bearer CRON_SECRET (idem autres crons).
 */

const BATCH_LIMIT = 200

export async function GET(req: NextRequest) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const admin = getAdminSupabase()
  const now = new Date().toISOString()

  const { data: expired, error: listErr } = await admin
    .from("candidates")
    .select("id, organization_id, cv_file_path")
    .not("retention_until", "is", null)
    .lte("retention_until", now)
    .limit(BATCH_LIMIT)

  if (listErr) {
    console.error("[cron/wipe-expired-candidates] list:", listErr)
    return NextResponse.json({ error: "list failed" }, { status: 500 })
  }

  const wiped: string[] = []
  const errors: Array<{ candidate_id: string; step: string; message: string }> = []

  for (const candidate of expired ?? []) {
    const orgId = candidate.organization_id as string | null
    const filePath = candidate.cv_file_path as string | null

    let bytesFreed = 0
    if (filePath && orgId) {
      const folder = filePath.split("/").slice(0, 2).join("/") // {org_id}/{candidate_id}
      try {
        bytesFreed = await r2SumSizeByPrefix("cv", folder + "/")
      } catch {
        try { bytesFreed = await r2GetSize({ bucket: "cv", path: filePath, callerOrgId: orgId }) }
        catch { /* ignore — la ligne DB partira quand même */ }
      }
      try {
        await r2DeleteByPrefix("cv", folder + "/")
      } catch (err) {
        console.error(`[cron/wipe-expired-candidates] R2 cleanup ${candidate.id}:`, err instanceof Error ? err.message : "unknown")
        errors.push({ candidate_id: candidate.id as string, step: "delete_r2", message: err instanceof Error ? err.message : "unknown" })
        // On continue quand même vers la suppression DB — mieux vaut une
        // ligne partie avec un fichier orphelin (rattrapable) qu'une donnée
        // candidat conservée au-delà de sa rétention (non conforme).
      }
    }

    const { error: delErr } = await admin.from("candidates").delete().eq("id", candidate.id)
    if (delErr) {
      console.error(`[cron/wipe-expired-candidates] db delete ${candidate.id}:`, delErr.message)
      errors.push({ candidate_id: candidate.id as string, step: "delete_db", message: delErr.message })
      continue
    }

    if (orgId && bytesFreed > 0) {
      await decrementStorageUsed(admin, orgId, bytesFreed)
    }
    wiped.push(candidate.id as string)
  }

  return NextResponse.json({
    ok: true,
    ran_at: now,
    candidates_wiped: wiped.length,
    candidates_remaining_this_batch: (expired ?? []).length - wiped.length - errors.length,
    errors,
  })
}
