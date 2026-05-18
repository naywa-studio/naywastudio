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
