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

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params

  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })

  // Verify ownership via RLS-scoped client
  const { data: candidate, error: fetchErr } = await sb
    .from("candidates")
    .select("id, user_id, cv_file_path, parse_status")
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
  let parsedCv: ParsedCv | null = null
  let taxonomy: CandidateTaxonomy | null = null
  let rawText = ""
  let parseError: { code: string; message: string } | null = null
  try {
    rawText = await extractPdfText(buf)
    const out = await parseCvWithLlm(rawText)
    parsedCv = out.cv
    taxonomy = out.taxonomy
  } catch (err) {
    const isScanned = err instanceof CvParseError &&
      (err.code === "scanned_pdf" || err.code === "empty_pdf")
    if (isScanned) {
      // OCR fallback (mistral-ocr via OpenRouter).
      try {
        const out = await parseCvViaOcr(buf)
        parsedCv = out.cv
        taxonomy = out.taxonomy
        parseError = null
      } catch (ocrErr) {
        parseError = ocrErr instanceof CvParseError
          ? { code: ocrErr.code, message: ocrErr.message }
          : { code: "ocr_failed", message: (ocrErr as Error).message ?? "L'OCR a échoué." }
      }
    } else {
      parseError = err instanceof CvParseError
        ? { code: err.code, message: err.message }
        : { code: "llm_failed", message: (err as Error).message ?? "Erreur de parsing." }
    }
  }

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

  // Dedup → silent supersede: the version with the most recent experience
  // end-date is kept canonical; the other is tagged "ancien" and hidden from
  // the default vivier. No banner, no manual action.
  let supersededOldId: string | null = null
  let currentIsAncien = false
  {
    type DupHit = { id: string; parsed_cv: ParsedCv | null; created_at: string; tags: string[] | null }
    let dupHit: DupHit | null = null
    if (parsedCv?.email) {
      const { data } = await admin
        .from("candidates").select("id, parsed_cv, created_at, tags")
        .eq("user_id", user.id).eq("email", parsedCv.email).neq("id", candidate.id)
        .limit(1).maybeSingle()
      if (data) dupHit = data as unknown as DupHit
    }
    if (!dupHit && parsedCv?.phone) {
      const { data } = await admin
        .from("candidates").select("id, parsed_cv, created_at, tags")
        .eq("user_id", user.id).eq("phone", parsedCv.phone).neq("id", candidate.id)
        .limit(1).maybeSingle()
      if (data) dupHit = data as unknown as DupHit
    }
    if (dupHit) {
      const newScore = freshnessTimestamp(parsedCv, new Date().toISOString())
      const oldScore = freshnessTimestamp(dupHit.parsed_cv, dupHit.created_at)
      if (newScore >= oldScore) {
        // The new upload wins → mark the old one as superseded.
        const cleaned = (dupHit.tags ?? []).filter((t) => t !== "doublon")
        if (!cleaned.includes("ancien")) cleaned.push("ancien")
        await admin.from("candidates").update({ tags: cleaned }).eq("id", dupHit.id)
        supersededOldId = dupHit.id
      } else {
        // The existing one is fresher → this upload is the old version.
        currentIsAncien = true
      }
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
      skills:           parsedCv?.skills ?? [],
      languages:        parsedCv?.languages ?? [],
      tags: currentIsAncien ? ["ancien"] : [],
    })
    .eq("id", candidate.id)
    .select("*")
    .single()

  if (updateErr) {
    return NextResponse.json({ error: "db_update_failed", detail: updateErr.message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    candidate: updated,
    superseded: supersededOldId,
    current_is_old_version: currentIsAncien,
  })
}

/**
 * Most recent timestamp the CV describes: latest experience end-date (or now
 * for a still-current role), falling back to the candidate row's created_at
 * when no usable dates exist.
 */
function freshnessTimestamp(cv: ParsedCv | null, fallbackIso: string): number {
  const now = Date.now()
  const exps = cv?.experience ?? []
  let latest = 0
  for (const e of exps) {
    if (e?.end === null) return now // still in role → freshest possible
    const s = typeof e?.end === "string" ? e.end : null
    if (!s) continue
    const m = s.match(/^(\d{4})(?:-(\d{1,2}))?/)
    if (!m) continue
    const y = parseInt(m[1], 10)
    if (y < 1950 || y > 2100) continue
    const mo = m[2] ? Math.max(1, Math.min(12, parseInt(m[2], 10))) - 1 : 11
    const t = Date.UTC(y, mo, 28)
    if (t > latest) latest = t
  }
  return latest || new Date(fallbackIso).getTime()
}
