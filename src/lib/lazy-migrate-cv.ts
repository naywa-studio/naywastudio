/**
 * Lazy migration d'un fichier CV de Supabase Storage vers R2,
 * déclenchée au moment d'un read (signed-url, parse).
 *
 * Pourquoi : entre le moment où PR3 est déployée et le passage du
 * cron `/api/cron/migrate-cv-to-r2` (max 24h), un user peut cliquer
 * sur une fiche candidat dont le CV est encore sur Supabase Storage.
 * On le migre à la volée pour qu'il vive sur R2 à partir de là, sans
 * attendre le cron.
 *
 * Idempotent : si le path commence déjà par `{org_id}/`, on ne touche
 * à rien et on renvoie le path inchangé.
 *
 * Best-effort : si la migration échoue, on log et on retourne le path
 * d'origine — l'appelant fera son fallback Supabase Storage habituel.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "./database.types"
import { r2Upload } from "./r2-storage"

/**
 * Migre le CV original si nécessaire. Met à jour candidates.cv_file_path
 * et supprime le fichier Supabase Storage. Renvoie le path R2 final
 * (ou le path d'origine en cas d'échec).
 */
export async function lazyMigrateCvFile(
  admin: SupabaseClient<Database>,
  candidateId: string,
  orgId: string,
  currentPath: string,
  contentType: string = "application/pdf",
): Promise<string> {
  if (currentPath.startsWith(orgId + "/")) return currentPath  // déjà R2-scoped

  try {
    const { data: blob, error: dlErr } = await admin.storage
      .from("cv-uploads")
      .download(currentPath)
    if (dlErr || !blob) throw new Error(`download: ${dlErr?.message ?? "missing"}`)

    const buf = Buffer.from(await blob.arrayBuffer())
    const filename = currentPath.split("/").pop() ?? "cv.pdf"
    const newPath = `${orgId}/${candidateId}/${filename}`

    await r2Upload({
      bucket: "cv",
      path: newPath,
      body: buf,
      contentType,
      callerOrgId: orgId,
    })

    await admin.from("candidates").update({ cv_file_path: newPath }).eq("id", candidateId)
    await admin.storage.from("cv-uploads").remove([currentPath]).catch(() => undefined)

    return newPath
  } catch (err) {
    console.error("[lazy-migrate-cv] cv migration error:", err instanceof Error ? err.message : "unknown")
    return currentPath
  }
}

/**
 * Variante pour le PDF anonymisé (chemin distinct).
 */
export async function lazyMigrateAnonymizedFile(
  admin: SupabaseClient<Database>,
  candidateId: string,
  orgId: string,
  currentPath: string,
): Promise<string> {
  if (currentPath.startsWith(orgId + "/")) return currentPath

  try {
    const { data: blob, error: dlErr } = await admin.storage
      .from("cv-uploads")
      .download(currentPath)
    if (dlErr || !blob) throw new Error(`download_anon: ${dlErr?.message ?? "missing"}`)

    const buf = Buffer.from(await blob.arrayBuffer())
    const newPath = `${orgId}/${candidateId}/anonymized.pdf`

    await r2Upload({
      bucket: "cv",
      path: newPath,
      body: buf,
      contentType: "application/pdf",
      callerOrgId: orgId,
    })

    await admin.from("candidates").update({ anonymized_pdf_path: newPath }).eq("id", candidateId)
    await admin.storage.from("cv-uploads").remove([currentPath]).catch(() => undefined)

    return newPath
  } catch (err) {
    console.error("[lazy-migrate-cv] anon migration error:", err instanceof Error ? err.message : "unknown")
    return currentPath
  }
}
