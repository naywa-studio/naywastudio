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
import { getAdminSupabase } from "@/lib/admin-supabase"
import { CvParseError, extractPdfText, parseCvWithLlm, parseCvViaOcr } from "@/lib/cv-parser"
import type { ParsedCv, CandidateTaxonomy } from "@/lib/database.types"

export const runtime = "nodejs"
export const maxDuration = 60 // pdf-parse + LLM round-trip

// Vercel kills the function at 60 s. We race the parse work against a
// 57 s watchdog so we have ~3 s to flip parse_status to "error" before
// the hard kill. Internal LLM timeouts (cv-parser.ts) are tuned so the
// primary text call caps at 25 s and the OCR fallback at 30 s — total
// worst case 55 s, comfortably under the watchdog. Without this, a hung
// upstream would leave parse_status="parsing" forever.
const WATCHDOG_MS = 57_000
class ParseTimeoutError extends Error {
  constructor() { super("parse_watchdog_timeout") }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params

  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })

  // Verify ownership via RLS-scoped client. We also pull `tags` so the
  // final update can MERGE the doublon flag instead of overwriting custom
  // tags + "ancien" — that overwrite was the root cause of the doublon
  // detection failing on re-parses of an archived candidate.
  const { data: candidate, error: fetchErr } = await sb
    .from("candidates")
    .select("id, user_id, cv_file_path, parse_status, tags")
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

  // Download the PDF
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
  const buf = Buffer.from(await blob.arrayBuffer())

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
        parse_error: "Le parsing a pris trop de temps (>50 s). Le PDF est peut-être trop volumineux ou complexe — réessayez ou recompressez-le.",
      }).eq("id", candidate.id)
      return NextResponse.json({
        ok: false, error: "parse_timeout",
        message: "Parsing trop long — réessayez.",
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

  // Auto-matching against open jobs — fire-and-forget, don't block the
  // parse response. The vivier UI picks up the new match_assessment rows
  // via the pipeline's realtime subscription.
  try {
    const origin = new URL(req.url).origin
    const cookieHeader = req.headers.get("cookie") ?? ""
    void fetch(`${origin}/api/candidates/${candidate.id}/match-all`, {
      method: "POST",
      headers: { cookie: cookieHeader },
      keepalive: true,
    }).catch(() => { /* fire and forget */ })
  } catch { /* ignore */ }

  return NextResponse.json({ ok: true, candidate: updated, has_doublon: hasDoublon })
}
