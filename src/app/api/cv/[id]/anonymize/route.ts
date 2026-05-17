/**
 * POST /api/cv/:id/anonymize
 *
 * Generates an anonymized PDF from the candidate's structured parsed_cv
 * (no name / photo / contacts / precise schools), stores it in the
 * cv-uploads bucket alongside the original, and records the path.
 *
 * GET  /api/cv/:id/anonymize  → signed URL for the anonymized PDF (if any).
 */

import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { getAdminSupabase } from "@/lib/admin-supabase"
import { renderToBuffer } from "@react-pdf/renderer"
import { AnonymizedCv, type AnonymizedJobContext } from "@/lib/anonymized-cv"
import type { Candidate } from "@/lib/database.types"

export const runtime = "nodejs"
export const maxDuration = 30

const TTL_SECONDS = 5 * 60

/** Short human reference, stable per candidate (first 8 chars of the id). */
function refFor(id: string): string {
  return id.replace(/-/g, "").slice(0, 8).toUpperCase()
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })

  const body = await req.json().catch(() => null) as { job_id?: unknown } | null
  const jobId = typeof body?.job_id === "string" ? body.job_id : null

  const { data: candidate, error } = await sb.from("candidates").select("*").eq("id", id).single()
  if (error || !candidate) return NextResponse.json({ error: "not_found" }, { status: 404 })
  if (candidate.parse_status !== "parsed" || !candidate.parsed_cv) {
    return NextResponse.json(
      { error: "not_parsed", message: "Le CV doit être parsé avant d'être anonymisé." },
      { status: 400 },
    )
  }

  // Pull the job to orient the PDF — title, must-have skills, briefing.
  // Optional: a job-less anonymisation falls back to the generic template.
  let jobContext: AnonymizedJobContext | null = null
  if (jobId) {
    const { data: job } = await sb
      .from("jobs")
      .select("id, title, location, seniority, required_skills, nice_to_have_skills, normalized, briefing")
      .eq("id", jobId)
      .single()
    if (job) {
      jobContext = {
        title: job.title,
        seniority: job.seniority,
        location: job.location,
        required_skills: job.required_skills ?? [],
        nice_to_have_skills: job.nice_to_have_skills ?? [],
        must_have_skills: job.normalized?.must_have_skills ?? [],
        role_family: job.normalized?.role_family?.[0] ?? null,
      }
    }
  }

  const reference = refFor(candidate.id)

  let buffer: Buffer
  try {
    buffer = Buffer.from(
      await renderToBuffer(
        AnonymizedCv({ candidate: candidate as Candidate, reference, job: jobContext }),
      ),
    )
  } catch (err) {
    return NextResponse.json(
      { error: "render_failed", detail: (err as Error).message },
      { status: 500 },
    )
  }

  const admin = getAdminSupabase()
  const path = `${user.id}/${candidate.id}/anonymized.pdf`
  const { error: upErr } = await admin.storage
    .from("cv-uploads")
    .upload(path, buffer, { contentType: "application/pdf", upsert: true })
  if (upErr) {
    return NextResponse.json({ error: "storage_failed", detail: upErr.message }, { status: 500 })
  }

  await admin.from("candidates").update({
    anonymized_pdf_path: path,
    anonymized_at: new Date().toISOString(),
  }).eq("id", candidate.id)

  const { data: signed } = await admin.storage
    .from("cv-uploads")
    .createSignedUrl(path, TTL_SECONDS, { download: `profil-anonymise-${reference}.pdf` })

  return NextResponse.json({ ok: true, url: signed?.signedUrl ?? null, reference })
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })

  const { data: candidate, error } = await sb
    .from("candidates")
    .select("user_id, anonymized_pdf_path, id")
    .eq("id", id)
    .single()
  if (error || !candidate) return NextResponse.json({ error: "not_found" }, { status: 404 })
  if (candidate.user_id !== user.id) return NextResponse.json({ error: "forbidden" }, { status: 403 })
  if (!candidate.anonymized_pdf_path) return NextResponse.json({ error: "no_file" }, { status: 404 })

  const admin = getAdminSupabase()
  const { data: signed, error: signErr } = await admin.storage
    .from("cv-uploads")
    .createSignedUrl(candidate.anonymized_pdf_path, TTL_SECONDS, {
      download: `profil-anonymise-${refFor(candidate.id)}.pdf`,
    })
  if (signErr || !signed) {
    return NextResponse.json({ error: "sign_failed", detail: signErr?.message }, { status: 500 })
  }
  return NextResponse.json({ url: signed.signedUrl, expires_in: TTL_SECONDS })
}
