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
import { CvParseError, extractPdfText, parseCvWithLlm } from "@/lib/cv-parser"
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

  // Parse
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
    parseError = err instanceof CvParseError
      ? { code: err.code, message: err.message }
      : { code: "llm_failed", message: (err as Error).message ?? "Erreur de parsing." }
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

  // Dedup (two safe .eq() queries — see route comment for rationale)
  let duplicateOf: string | null = null
  if (parsedCv?.email) {
    const { data: hit } = await admin
      .from("candidates").select("id")
      .eq("user_id", user.id).eq("email", parsedCv.email).neq("id", candidate.id)
      .limit(1).maybeSingle()
    if (hit) duplicateOf = hit.id
  }
  if (!duplicateOf && parsedCv?.phone) {
    const { data: hit } = await admin
      .from("candidates").select("id")
      .eq("user_id", user.id).eq("phone", parsedCv.phone).neq("id", candidate.id)
      .limit(1).maybeSingle()
    if (hit) duplicateOf = hit.id
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
      tags: duplicateOf ? ["doublon"] : [],
    })
    .eq("id", candidate.id)
    .select("*")
    .single()

  if (updateErr) {
    return NextResponse.json({ error: "db_update_failed", detail: updateErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, candidate: updated, duplicate_of: duplicateOf })
}
