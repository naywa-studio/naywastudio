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

import { candidateRefSlug as refFor } from "@/lib/candidate-ref"

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

  // Per-client brand — name + signed logo URL (1h) so the PDF carries
  // the cabinet's identity instead of Naywa's by default.
  const { data: profile } = await sb
    .from("profiles").select("brand_name, brand_logo_path").eq("user_id", user.id).maybeSingle()

  let brandLogoUrl: string | null = null
  if (profile?.brand_logo_path) {
    const adminTmp = getAdminSupabase()
    const { data: signed } = await adminTmp.storage
      .from("brand-logos")
      .createSignedUrl(profile.brand_logo_path, 60 * 60)
    brandLogoUrl = signed?.signedUrl ?? null
  }
  const brand = {
    name: profile?.brand_name?.trim() || null,
    logoUrl: brandLogoUrl,
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
      // Formal title for the client : prefer the LLM-normalised role_family
      // (joined with " / " when there's a FR/EN pair) so the PDF says
      // "Ingénieur data / Data engineer" instead of whatever the sourcer
      // typed in the form ("Ingénieur en Data"). Falls back to the raw
      // title when no normalised role is available.
      const rf = job.normalized?.role_family ?? []
      const formalTitle = rf.length > 0 ? rf.slice(0, 2).join(" / ") : job.title

      jobContext = {
        title: formalTitle,
        seniority: job.seniority,
        location: job.location,
        required_skills: job.required_skills ?? [],
        nice_to_have_skills: job.nice_to_have_skills ?? [],
        must_have_skills: job.normalized?.must_have_skills ?? [],
        role_family: rf[0] ?? null,
      }
    }
  }

  const reference = refFor(candidate.id)

  let buffer: Buffer
  try {
    buffer = Buffer.from(
      await renderToBuffer(
        AnonymizedCv({ candidate: candidate as Candidate, reference, job: jobContext, brand }),
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

  // Two signed URLs so the UI can both PREVIEW the PDF (inline iframe,
  // no Content-Disposition: attachment) AND offer a one-click download.
  // The download URL forces the browser to save instead of preview by
  // setting the attachment header.
  const [{ data: previewSigned }, { data: downloadSigned }] = await Promise.all([
    admin.storage.from("cv-uploads").createSignedUrl(path, TTL_SECONDS),
    admin.storage.from("cv-uploads").createSignedUrl(path, TTL_SECONDS, {
      download: `profil-anonymise-${reference}.pdf`,
    }),
  ])

  return NextResponse.json({
    ok: true,
    url: previewSigned?.signedUrl ?? null,            // backward compat: still the preview URL
    preview_url: previewSigned?.signedUrl ?? null,
    download_url: downloadSigned?.signedUrl ?? null,
    reference,
  })
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
  const [{ data: previewSigned, error: pErr }, { data: downloadSigned }] = await Promise.all([
    admin.storage.from("cv-uploads").createSignedUrl(candidate.anonymized_pdf_path, TTL_SECONDS),
    admin.storage.from("cv-uploads").createSignedUrl(candidate.anonymized_pdf_path, TTL_SECONDS, {
      download: `profil-anonymise-${refFor(candidate.id)}.pdf`,
    }),
  ])
  if (pErr || !previewSigned) {
    return NextResponse.json({ error: "sign_failed", detail: pErr?.message }, { status: 500 })
  }
  return NextResponse.json({
    url: previewSigned.signedUrl,                       // backward compat: preview
    preview_url: previewSigned.signedUrl,
    download_url: downloadSigned?.signedUrl ?? previewSigned.signedUrl,
    expires_in: TTL_SECONDS,
  })
}
