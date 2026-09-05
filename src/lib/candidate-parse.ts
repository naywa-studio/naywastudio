/**
 * Cœur du parsing CV — extrait de POST /api/cv/[id]/parse (Slice 6.1) pour
 * être appelé AUSSI par la route publique de candidature (/api/apply/[token]),
 * qui n'a pas de session authentifiée pour faire un aller-retour HTTP vers
 * cette route. Comportement inchangé au caractère près — la route existante
 * est redevenue un wrapper fin (auth + appel de cette fonction).
 *
 * Un seul endroit qui sait parser un CV : deux copies auraient fini par
 * diverger (watchdog, fallback OCR, dédup, classement secteur...).
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { CvParseError, extractPdfText, parseCvWithLlm, parseCvViaOcr } from "./cv-parser"
import { classifySectors } from "./sector-classify"
import type { ParsedCv, CandidateTaxonomy, Candidate, Database } from "./database.types"

// Même budget que l'ancien watchdog inline (cf. l'historique de cette route).
const WATCHDOG_MS = 75_000
class ParseTimeoutError extends Error {
  constructor() { super("parse_watchdog_timeout") }
}

export interface ParseCandidateInput {
  id: string
  /** Attribué au recruteur pour la détection de doublon (scope user_id,
   *  comportement pré-existant inchangé). Pour un candidat issu du
   *  formulaire public, c'est le propriétaire de la mission. */
  user_id: string
  organization_id: string | null
  cv_file_path: string
  tags: string[] | null
  taxonomy: CandidateTaxonomy | null
}

export type ParseCandidateOutcome =
  | { kind: "timeout" }
  | { kind: "download_failed" }
  | { kind: "parse_error"; code: string; message: string }
  | { kind: "db_update_failed" }
  | { kind: "success"; candidate: Candidate; hasDoublon: boolean }

export async function parseCandidateCv(
  admin: SupabaseClient<Database>,
  candidate: ParseCandidateInput,
): Promise<ParseCandidateOutcome> {
  await admin.from("candidates").update({
    parse_status: "parsing",
    parse_error: null,
  }).eq("id", candidate.id)

  let cvFilePath = candidate.cv_file_path

  // Lazy migration si le fichier est encore sur Supabase Storage.
  if (candidate.organization_id && !cvFilePath.startsWith(candidate.organization_id + "/")) {
    const { lazyMigrateCvFile } = await import("./lazy-migrate-cv")
    cvFilePath = await lazyMigrateCvFile(admin, candidate.id, candidate.organization_id, cvFilePath)
  }

  let buf: Buffer
  const looksR2Scoped = !!candidate.organization_id && cvFilePath.startsWith(candidate.organization_id + "/")
  if (looksR2Scoped) {
    try {
      const { r2Download } = await import("./r2-storage")
      const dl = await r2Download({ bucket: "cv", path: cvFilePath, callerOrgId: candidate.organization_id! })
      buf = dl.body
    } catch (err) {
      console.error("[candidate-parse] R2 download error:", err instanceof Error ? err.message : "unknown")
      await admin.from("candidates").update({
        parse_status: "error",
        parse_error: "R2 download failed",
      }).eq("id", candidate.id)
      return { kind: "download_failed" }
    }
  } else {
    const { data: blob, error: dlErr } = await admin.storage.from("cv-uploads").download(cvFilePath)
    if (dlErr || !blob) {
      await admin.from("candidates").update({
        parse_status: "error",
        parse_error: `Storage download: ${dlErr?.message ?? "fichier introuvable"}`,
      }).eq("id", candidate.id)
      return { kind: "download_failed" }
    }
    buf = Buffer.from(await blob.arrayBuffer())
  }

  type ParseOutcome = {
    parsedCv: ParsedCv | null
    taxonomy: CandidateTaxonomy | null
    rawText: string
    parseError: { code: string; message: string } | null
  }

  const doParse = async (): Promise<ParseOutcome> => {
    let parsedCv: ParsedCv | null = null
    let taxonomy: CandidateTaxonomy | null = null
    let rawText = ""
    let parseError: { code: string; message: string } | null = null
    const t0 = Date.now()
    try {
      rawText = await extractPdfText(buf)
      const t1 = Date.now()
      console.log(`[parse ${candidate.id}] extract=${t1 - t0}ms text=${rawText.length}c`)
      const out = await parseCvWithLlm(rawText)
      console.log(`[parse ${candidate.id}] llm=${Date.now() - t1}ms ok`)
      parsedCv = out.cv
      taxonomy = out.taxonomy
    } catch (err) {
      console.log(`[parse ${candidate.id}] primary failed @${Date.now() - t0}ms : ${(err as Error).message}`)
      const isLlmJsonError = err instanceof CvParseError && err.code === "llm_invalid_json"
      if (isLlmJsonError) {
        parseError = { code: err.code, message: err.message }
      } else {
        const tOcr = Date.now()
        try {
          const out = await parseCvViaOcr(buf)
          console.log(`[parse ${candidate.id}] ocr=${Date.now() - tOcr}ms ok`)
          parsedCv = out.cv
          taxonomy = out.taxonomy
        } catch (ocrErr) {
          console.log(`[parse ${candidate.id}] ocr failed @${Date.now() - tOcr}ms : ${(ocrErr as Error).message}`)
          const originalErr = err instanceof CvParseError
            ? { code: err.code, message: err.message }
            : { code: "llm_failed", message: (err as Error).message ?? "Erreur de parsing." }
          const ocrFailed = ocrErr instanceof CvParseError
            ? { code: ocrErr.code, message: ocrErr.message }
            : { code: "ocr_failed", message: (ocrErr as Error).message ?? "L'OCR a échoué." }
          parseError = {
            code: originalErr.code,
            message: `${originalErr.message} (OCR fallback : ${ocrFailed.message})`,
          }
        }
      }
    }
    return { parsedCv, taxonomy, rawText, parseError }
  }

  let watchdogTimer: ReturnType<typeof setTimeout> | null = null
  const watchdog = new Promise<never>((_, reject) => {
    watchdogTimer = setTimeout(() => reject(new ParseTimeoutError()), WATCHDOG_MS)
  })

  let outcome: ParseOutcome
  try {
    outcome = await Promise.race([doParse(), watchdog])
  } catch (raceErr) {
    if (raceErr instanceof ParseTimeoutError) {
      await admin.from("candidates").update({
        parse_status: "error",
        parse_error: "Le parsing a pris trop de temps (>50 s). Le PDF est peut-être trop volumineux ou complexe. Réessayez ou recompressez-le.",
      }).eq("id", candidate.id)
      return { kind: "timeout" }
    }
    throw raceErr
  } finally {
    if (watchdogTimer) clearTimeout(watchdogTimer)
  }

  const { parsedCv, taxonomy, rawText, parseError } = outcome

  if (parseError) {
    await admin.from("candidates").update({
      parse_status: "error",
      parse_error: parseError.message,
      raw_text: rawText || null,
    }).eq("id", candidate.id)
    return { kind: "parse_error", code: parseError.code, message: parseError.message }
  }

  // Dédup — scope user_id, comportement pré-existant inchangé.
  let hasDoublon = false
  {
    type DupRow = { id: string; tags: string[] | null }
    const siblings: DupRow[] = []
    if (parsedCv?.email) {
      const { data } = await admin
        .from("candidates").select("id, tags")
        .eq("user_id", candidate.user_id).eq("email", parsedCv.email).neq("id", candidate.id)
      if (Array.isArray(data)) siblings.push(...(data as DupRow[]))
    }
    if (siblings.length === 0 && parsedCv?.phone) {
      const { data } = await admin
        .from("candidates").select("id, tags")
        .eq("user_id", candidate.user_id).eq("phone", parsedCv.phone).neq("id", candidate.id)
      if (Array.isArray(data)) siblings.push(...(data as DupRow[]))
    }
    const liveSiblings = siblings.filter((s) => !(s.tags ?? []).includes("ancien"))
    for (const s of liveSiblings) {
      const t = s.tags ?? []
      if (t.includes("doublon")) continue
      await admin.from("candidates").update({ tags: [...t, "doublon"] }).eq("id", s.id)
    }
    hasDoublon = liveSiblings.length > 0
  }

  // Classement secteur — best-effort, borné.
  let sectors: string[] = []
  let sectorStatus: "auto" | "to_review" = "to_review"
  if (candidate.organization_id) {
    const { data: existingSectorsRows } = await admin
      .from("sectors").select("name, description").eq("organization_id", candidate.organization_id)
    const existingKnown = (existingSectorsRows ?? []).map((s) => ({ name: s.name, description: s.description }))
    const existingNames = existingKnown.map((s) => s.name)
    const cls = await classifySectors({
      current_title: parsedCv?.current_title,
      current_company: parsedCv?.current_company,
      years_experience: parsedCv?.years_experience,
      skills: parsedCv?.skills,
      summary: parsedCv?.summary,
    }, existingKnown)
    sectors = cls.sectors
    sectorStatus = cls.status
    const lowerExisting = new Set(existingNames.map((n) => n.toLowerCase()))
    const toCreate = sectors.filter((s) => !lowerExisting.has(s.toLowerCase()))
    if (toCreate.length > 0) {
      await admin.from("sectors").upsert(
        toCreate.map((name) => ({ organization_id: candidate.organization_id!, name, created_by: "nora" as const })),
        { onConflict: "organization_id,name", ignoreDuplicates: true },
      )
    }
  }

  const previousMissionTags = candidate.taxonomy?.mission_tags ?? []
  const mergedTaxonomy: CandidateTaxonomy | null = taxonomy
    ? { ...taxonomy, mission_tags: previousMissionTags }
    : taxonomy

  const { data: updated, error: updateErr } = await admin
    .from("candidates")
    .update({
      parse_status: "parsed",
      parse_error: null,
      parsed_at: new Date().toISOString(),
      parsed_cv: parsedCv,
      parsed_cv_original: null,
      parsed_cv_edited_at: null,
      taxonomy_original: null,
      taxonomy: mergedTaxonomy,
      raw_text: rawText,
      full_name:        parsedCv?.full_name ?? null,
      email:            parsedCv?.email ?? null,
      phone:            parsedCv?.phone ?? null,
      location:         parsedCv?.location ?? null,
      linkedin_url:     parsedCv?.linkedin_url ?? null,
      current_title:    parsedCv?.current_title ?? null,
      current_company: parsedCv?.current_company ?? null,
      years_experience: parsedCv?.years_experience ?? null,
      seniority_level:  parsedCv?.seniority_level ?? null,
      is_apprentice:    parsedCv?.is_apprentice === true,
      skills:           parsedCv?.skills ?? [],
      languages:        parsedCv?.languages ?? [],
      sectors,
      sector_status:    sectorStatus,
      tags: (() => {
        const existing = (candidate.tags ?? []).filter((t) => t !== "doublon")
        return hasDoublon ? [...existing, "doublon"] : existing
      })(),
    })
    .eq("id", candidate.id)
    .select("*")
    .single()

  if (updateErr) {
    console.error("[candidate-parse] db update failed:", updateErr.message)
    return { kind: "db_update_failed" }
  }

  return { kind: "success", candidate: updated as unknown as Candidate, hasDoublon }
}
