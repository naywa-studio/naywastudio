/**
 * POST /api/cv/:id/parse
 *
 * Background-style parse step. The candidate row + PDF are already stored
 * by /api/cv/upload — this route:
 *
 *   1. Verifies ownership.
 *   2. Sets parse_status = "parsing" (idempotent — also tolerates retry).
 *   3. Downloads the PDF from Storage.
 *   4. Extracts text → LLM parse → dedup → updates the row.
 *
 * The client fires this fire-and-forget; the vivier UI re-renders via
 * Realtime when parse_status flips to "parsed" or "error". A "Relancer
 * le parsing" button on the candidate page also POSTs here.
 */

import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { requireActiveAccess } from "@/lib/access-guard"
import { getAdminSupabase } from "@/lib/admin-supabase"
import { CvParseError, extractPdfText, parseCvWithLlm, parseCvViaOcr } from "@/lib/cv-parser"
import { classifySectors } from "@/lib/sector-classify"
import type { ParsedCv, CandidateTaxonomy } from "@/lib/database.types"

export const runtime = "nodejs"
// pdf-parse + LLM parse + classification secteur (bornée 10 s). 90 s laisse
// de la marge pour l'enchaînement parse (≤ watchdog) + classify.
export const maxDuration = 90

// Vercel kills the function at 60 s. We race the parse work against a
// 57 s watchdog so we have ~3 s to flip parse_status to "error" before
// the hard kill. Internal LLM timeouts (cv-parser.ts) are tuned so the
// primary text call caps at 25 s and the OCR fallback at 30 s — total
// worst case 55 s, comfortably under the watchdog. Without this, a hung
// upstream would leave parse_status="parsing" forever.
const WATCHDOG_MS = 75_000
class ParseTimeoutError extends Error {
  constructor() { super("parse_watchdog_timeout") }
}

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params

  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })
  const gate = await requireActiveAccess()
  if (!gate.ok) return gate.response

  // Verify ownership via RLS-scoped client. We also pull `tags` so the
  // final update can MERGE the doublon flag instead of overwriting custom
  // tags + "ancien" — that overwrite was the root cause of the doublon
  // detection failing on re-parses of an archived candidate.
  // organization_id pour le scoping R2 (assertOrgScopedPath).
  const { data: candidate, error: fetchErr } = await sb
    .from("candidates")
    .select("id, user_id, organization_id, cv_file_path, parse_status, tags")
    .eq("id", id)
    .single()
  if (fetchErr || !candidate) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }
  if (!candidate.cv_file_path) {
    return NextResponse.json({ error: "no_file" }, { status: 400 })
  }

  const admin = getAdminSupabase()

  // Mark as parsing (idempotent — also resets a previous error state)
  await admin.from("candidates").update({
    parse_status: "parsing",
    parse_error: null,
  }).eq("id", candidate.id)

  // Lazy migration si le fichier est encore sur Supabase Storage.
  // Avant d'attaquer le download, on essaie de migrer pour que les
  // appels suivants soient déjà sur R2.
  if (candidate.organization_id && !candidate.cv_file_path.startsWith(candidate.organization_id + "/")) {
    const { lazyMigrateCvFile } = await import("@/lib/lazy-migrate-cv")
    const newPath = await lazyMigrateCvFile(
      admin, candidate.id, candidate.organization_id, candidate.cv_file_path,
    )
    candidate.cv_file_path = newPath
  }

  // Download the PDF — R2 si le path est org-scopé ({org_id}/...),
  // fallback Supabase Storage pour les anciens fichiers pré-migration.
  let buf: Buffer
  const looksR2Scoped = !!candidate.organization_id
    && candidate.cv_file_path.startsWith(candidate.organization_id + "/")
  if (looksR2Scoped) {
    try {
      const { r2Download } = await import("@/lib/r2-storage")
      const dl = await r2Download({
        bucket: "cv",
        path: candidate.cv_file_path,
        callerOrgId: candidate.organization_id,
      })
      buf = dl.body
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown"
      console.error("[cv/parse] R2 download error:", msg)
      await admin.from("candidates").update({
        parse_status: "error",
        parse_error: "R2 download failed",
      }).eq("id", candidate.id)
      return NextResponse.json({ error: "download_failed" }, { status: 500 })
    }
  } else {
    // Fallback Supabase Storage (CV uploadés avant migration R2).
    const { data: blob, error: dlErr } = await admin.storage
      .from("cv-uploads")
      .download(candidate.cv_file_path)
    if (dlErr || !blob) {
      await admin.from("candidates").update({
        parse_status: "error",
        parse_error: `Storage download: ${dlErr?.message ?? "fichier introuvable"}`,
      }).eq("id", candidate.id)
      return NextResponse.json({ error: "download_failed" }, { status: 500 })
    }
    buf = Buffer.from(await blob.arrayBuffer())
  }

  // Parse — text path first; fall back to OCR for scanned / empty-text PDFs.
  // Wrapped in a watchdog race so we can flip parse_status="error"
  // gracefully if the LLM/OCR call hangs past 50 s.
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
      // Tous les échecs d'extraction texte basculent vers l'OCR Mistral.
      // unpdf 1.6.2 throw "Invalid PDF structure" sur certains exports
      // modernes — l'OCR voit l'image rendue et fonctionne quand même.
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
      // The LLM / OCR hung past our 50 s budget. Flip status to error
      // with a clear message before Vercel kills us at 60 s.
      await admin.from("candidates").update({
        parse_status: "error",
        parse_error: "Le parsing a pris trop de temps (>50 s). Le PDF est peut-être trop volumineux ou complexe. Réessayez ou recompressez-le.",
      }).eq("id", candidate.id)
      return NextResponse.json({
        ok: false, error: "parse_timeout",
        message: "Parsing trop long, réessayez.",
      }, { status: 200 })
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
    return NextResponse.json({
      ok: false, error: parseError.code, message: parseError.message,
    }, { status: 200 })
  }

  // Dedup detection — tag every duplicate (this one + the existing siblings)
  // with "doublon" so the vivier surfaces them. The actual supersede happens
  // when the sourcer clicks "Lancer le tri" (POST /api/candidates/dedup).
  let hasDoublon = false
  {
    type DupRow = { id: string; tags: string[] | null }
    const siblings: DupRow[] = []
    if (parsedCv?.email) {
      const { data } = await admin
        .from("candidates").select("id, tags")
        .eq("user_id", user.id).eq("email", parsedCv.email).neq("id", candidate.id)
      if (Array.isArray(data)) siblings.push(...(data as DupRow[]))
    }
    if (siblings.length === 0 && parsedCv?.phone) {
      const { data } = await admin
        .from("candidates").select("id, tags")
        .eq("user_id", user.id).eq("phone", parsedCv.phone).neq("id", candidate.id)
      if (Array.isArray(data)) siblings.push(...(data as DupRow[]))
    }
    // A sibling already archived ("ancien") is not a live duplicate — it has
    // been superseded. Only siblings still visible in the vivier matter.
    const liveSiblings = siblings.filter((s) => !(s.tags ?? []).includes("ancien"))
    for (const s of liveSiblings) {
      const t = s.tags ?? []
      if (t.includes("doublon")) continue
      await admin.from("candidates").update({ tags: [...t, "doublon"] }).eq("id", s.id)
    }
    hasDoublon = liveSiblings.length > 0
  }

  // Classement SECTEUR (best-effort, borné à 10 s). Nora range le CV dans les
  // secteurs existants en priorité, crée un nouveau secteur si besoin, ou
  // bascule en "à classer" si elle n'est pas sûre. Un candidat sans secteur /
  // to_review n'est jamais exclu du matching.
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
    // Enregistre les secteurs NOUVEAUX proposés par Nora (created_by=nora).
    const lowerExisting = new Set(existingNames.map((n) => n.toLowerCase()))
    const toCreate = sectors.filter((s) => !lowerExisting.has(s.toLowerCase()))
    if (toCreate.length > 0) {
      await admin.from("sectors").upsert(
        toCreate.map((name) => ({ organization_id: candidate.organization_id!, name, created_by: "nora" as const })),
        { onConflict: "organization_id,name", ignoreDuplicates: true },
      )
    }
  }

  const { data: updated, error: updateErr } = await admin
    .from("candidates")
    .update({
      parse_status: "parsed",
      parse_error: null,
      parsed_at: new Date().toISOString(),
      parsed_cv: parsedCv,
      taxonomy,
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
      // Preserve every existing tag (custom + "ancien") and only flip the
      // "doublon" flag based on the fresh detection. Previously this row
      // was set to `hasDoublon ? ["doublon"] : []` which wiped "ancien"
      // and any custom tag on every re-parse.
      tags: (() => {
        const existing = (candidate.tags ?? []).filter((t) => t !== "doublon")
        return hasDoublon ? [...existing, "doublon"] : existing
      })(),
    })
    .eq("id", candidate.id)
    .select("*")
    .single()

  if (updateErr) {
    return NextResponse.json({ error: "db_update_failed", detail: updateErr.message }, { status: 500 })
  }

  // PLUS d'auto-matching à l'ajout d'un CV (retour Elyas) : le scoring ne
  // part que sur action explicite du sourceur — "Matcher le vivier" dans une
  // mission (avec mode + secteurs), ou l'import depuis une mission (score-one).
  // Ça évite de scorer tout le vivier × toutes les missions à chaque upload.

  return NextResponse.json({ ok: true, candidate: updated, has_doublon: hasDoublon })
}
