/**
 * Actions RGPD sur un candidat — historique + anonymisation (scrub PII).
 *
 * Centralisé ici parce que 3 routes en ont besoin (anonymize, delete, et la
 * purge auto du cron) et que la logique de nettoyage R2 doit rester EXACTEMENT
 * la même partout — deux copies légèrement différentes finissent toujours
 * par diverger.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "./database.types"
import { candidateRefLabel } from "./candidate-ref"
import { r2GetSize, r2SumSizeByPrefix, r2DeleteByPrefix } from "./r2-storage"
import { decrementStorageUsed } from "./quota"

export type CandidateRgpdAction =
  | "export"
  | "delete"
  | "anonymize"
  | "consent_granted"
  | "consent_revoked"
  | "opt_out_contact"
  | "auto_purged"

/**
 * Écrit une ligne d'historique. Best-effort (même pattern que
 * logAdminAction) : un échec de log ne doit jamais faire échouer l'action
 * métier qu'il documente.
 *
 * `candidateRef` doit être calculé AVANT une suppression/anonymisation
 * (candidateRefLabel(id)) — passé explicitement plutôt que recalculé ici pour
 * ne jamais dépendre d'un candidat qui n'existe déjà plus au moment du log.
 */
export async function logCandidateRgpdAction(
  admin: SupabaseClient<Database>,
  params: {
    organizationId: string
    candidateId: string | null
    candidateRef: string
    action: CandidateRgpdAction
    actorUserId?: string | null
    detail?: string | null
  },
): Promise<void> {
  const { error } = await admin.from("candidate_rgpd_log").insert({
    organization_id: params.organizationId,
    candidate_id: params.candidateId,
    candidate_ref: params.candidateRef,
    action: params.action,
    actor_user_id: params.actorUserId ?? null,
    detail: params.detail ?? null,
  })
  if (error) {
    console.error("[candidate-rgpd] log insert failed:", error.message)
  }
}

export interface ScrubResult {
  ok: boolean
  message?: string
}

/**
 * Vide les données identifiantes d'un candidat et supprime ses fichiers R2 —
 * la ligne SURVIT (pas de delete), pour que les stats agrégées (séniorité,
 * secteurs, compétences...) restent exploitables sans qu'on puisse plus
 * identifier la personne. Reprend le même nettoyage R2 que
 * `DELETE /api/cv/[id]` (compte la taille avant, purge, décrémente le quota).
 *
 * Volontairement CONSERVÉ (pas nullifié) : years_experience, seniority_level,
 * is_apprentice, skills, languages, sectors/sector_status, current_title,
 * created_at — aucun n'identifie directement quelqu'un, et les perdre casse
 * silencieusement les stats du vivier sans bénéfice RGPD réel.
 *
 * ⚠️ N'écrit PAS `candidates.anonymized_at` — cette colonne existe déjà pour
 * une fonctionnalité produit sans rapport (document anonymisé remis à un
 * client). Le scrub RGPD a sa propre colonne : `rgpd_anonymized_at`.
 */
export async function scrubCandidatePii(
  admin: SupabaseClient<Database>,
  candidate: { id: string; organization_id: string; cv_file_path: string | null },
): Promise<ScrubResult> {
  let bytesFreed = 0
  if (candidate.cv_file_path && candidate.organization_id) {
    const folder = candidate.cv_file_path.split("/").slice(0, 2).join("/")
    try {
      bytesFreed = await r2SumSizeByPrefix("cv", folder + "/")
    } catch {
      try { bytesFreed = await r2GetSize({ bucket: "cv", path: candidate.cv_file_path, callerOrgId: candidate.organization_id }) }
      catch { /* ignore */ }
    }
    try {
      await r2DeleteByPrefix("cv", folder + "/")
    } catch (err) {
      console.error("[candidate-rgpd] R2 cleanup error:", err instanceof Error ? err.message : "unknown")
      // On continue quand même le scrub DB — mieux vaut des PII effacées en
      // base avec un fichier R2 orphelin (rattrapable) que l'inverse.
    }
  }

  const { error } = await admin
    .from("candidates")
    .update({
      full_name: null,
      email: null,
      phone: null,
      location: null,
      linkedin_url: null,
      current_company: null,
      cv_file_path: null,
      cv_file_name: null,
      cv_file_size: null,
      cv_mime_type: null,
      anonymized_pdf_path: null,
      raw_text: null,
      parsed_cv: null,
      taxonomy: null,
      parsed_cv_original: null,
      taxonomy_original: null,
      outreach_draft: null,
      outreach_meta: null,
      notes: null,
      rgpd_anonymized_at: new Date().toISOString(),
    })
    .eq("id", candidate.id)

  if (error) {
    console.error("[candidate-rgpd] scrub update failed:", error.message)
    return { ok: false, message: "scrub_failed" }
  }

  if (candidate.organization_id && bytesFreed > 0) {
    await decrementStorageUsed(admin, candidate.organization_id, bytesFreed)
  }

  return { ok: true }
}

export { candidateRefLabel }
