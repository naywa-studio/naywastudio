/**
 * POST /api/cv/:id/anonymize/docx
 *
 * Génère et renvoie une version .docx (Word) du CV anonymisé.
 *
 * Indépendant de la route /api/cv/:id/anonymize (qui produit le PDF) :
 * le .docx vit en tant que format d'édition, distinct du PDF de
 * présentation. Pas de storage, pas de cache — généré à la volée, on
 * stream le buffer directement avec Content-Disposition: attachment.
 *
 * Body identique à la route PDF : { job_id, options }, sauf que les
 * options "template" et "watermark" sont ignorées (le .docx a un
 * format simple linéaire, voir lib/anonymized-cv-docx.ts).
 */

import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { requireActiveAccess } from "@/lib/access-guard"
import { getAdminSupabase } from "@/lib/admin-supabase"
import { buildAnonymizedDocx } from "@/lib/anonymized-cv-docx"
import { candidateRefSlug as refFor } from "@/lib/candidate-ref"
import type { AnonymizedJobContext } from "@/lib/anonymized-cv"
import type { Candidate } from "@/lib/database.types"

export const runtime = "nodejs"
export const maxDuration = 9

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })
  const gate = await requireActiveAccess()
  if (!gate.ok) return gate.response

  const body = await req.json().catch(() => null) as {
    job_id?: unknown
    options?: {
      keep_nora_summary?: unknown
      custom_text?: unknown
      language?: unknown
    }
  } | null
  const jobId = typeof body?.job_id === "string" ? body.job_id : null

  const optRaw = body?.options ?? {}
  const keepNoraSummary = typeof optRaw.keep_nora_summary === "boolean" ? optRaw.keep_nora_summary : true
  const customText =
    typeof optRaw.custom_text === "string" ? optRaw.custom_text.trim().slice(0, 600) : ""
  const language: "fr" | "en" = optRaw.language === "en" ? "en" : "fr"

  const { data: candidate, error } = await sb.from("candidates").select("*").eq("id", id).single()
  if (error || !candidate) return NextResponse.json({ error: "not_found" }, { status: 404 })
  if (candidate.parse_status !== "parsed" || !candidate.parsed_cv) {
    return NextResponse.json(
      { error: "not_parsed", message: "Le CV doit être parsé avant d'être anonymisé." },
      { status: 400 },
    )
  }

  // Brand cabinet (logo non-utilisé dans le .docx : Word gère mal les
  // images embarquées proprement, on garde uniquement nom + slogan +
  // couleur + mail contact).
  const { data: profile } = await sb
    .from("profiles").select("organization_id").eq("user_id", user.id).maybeSingle()

  let brandName: string | null = null
  let brandColor: string | null = null
  let brandColorSecondary: string | null = null
  let brandSlogan: string | null = null
  let contactEmail: string | null = null
  if (profile?.organization_id) {
    const { data: org } = await sb
      .from("organizations")
      .select("brand_name, brand_color, brand_color_secondary, brand_slogan, contact_email, name")
      .eq("id", profile.organization_id)
      .maybeSingle()
    brandName = (org?.brand_name?.trim() || org?.name?.trim()) || null
    brandColor = org?.brand_color ?? null
    brandColorSecondary = org?.brand_color_secondary ?? null
    brandSlogan = org?.brand_slogan ?? null
    contactEmail = org?.contact_email ?? null
  }
  const brand = {
    name: brandName,
    logoUrl: null,
    color: brandColor,
    colorSecondary: brandColorSecondary,
    slogan: brandSlogan,
    contactEmail,
  }

  // Job context — utilisé pour le headline ("Présenté pour : <mission>").
  // On ne réutilise PAS l'executive summary LLM ici (latence + coût) :
  // le .docx est une version d'édition. On affiche cv.summary parsé.
  // Le sourceur pourra coller le résumé LLM depuis le PDF s'il veut.
  let jobContext: AnonymizedJobContext | null = null
  if (jobId) {
    const { data: job } = await sb
      .from("jobs")
      .select("id, title, location, seniority, required_skills, nice_to_have_skills, normalized, briefing")
      .eq("id", jobId)
      .single()
    if (job) {
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
    buffer = await buildAnonymizedDocx({
      candidate: candidate as Candidate,
      reference,
      job: jobContext,
      brand,
      executiveSummary: null,
      options: {
        keepNoraSummary,
        customText,
        language,
      },
    })
  } catch (err) {
    console.error("[anonymize/docx] build failed", err)
    return NextResponse.json(
      { error: "build_failed", message: (err as Error).message },
      { status: 500 },
    )
  }

  // On evite Storage : le .docx est généré à la volée + servi direct.
  // Pas de quota disk + pas de URL signée à invalider. La mémoire en
  // attendant que getAdminSupabase soit utilisé reste minimale.
  void getAdminSupabase

  const filename = `cv-anonymise-${reference}${language === "en" ? "-en" : ""}.docx`

  // Convert Node Buffer to Uint8Array for the Response. NextResponse
  // accepts any BodyInit-compatible value; Uint8Array works in all
  // runtimes.
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-cache",
    },
  })
}
