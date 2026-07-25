/**
 * POST /api/jobs/:id/anonymize-batch   { candidate_ids: string[] }
 *
 * Génère les CV anonymisés de plusieurs candidats d'une même mission et renvoie
 * un ZIP (généré côté serveur — les URLs R2 signées ne sont pas fetchables côté
 * navigateur pour cause de CORS). Sert le « télécharger la sélection » de la
 * shortlist (lot C).
 *
 * Options = mêmes règles que l'anonymisation unitaire : gabarit cabinet (org) +
 * options mission (jobs.anonymize_options), résumé Nora masqué par défaut. Chaque
 * PDF est aussi persisté (R2) comme l'anonymisation unitaire.
 *
 * Accès : requireActiveAccess (abonnement/essai + siège). Quota LLM org consommé
 * uniquement quand le résumé Nora est actif (un appel par candidat concerné).
 */

import { NextRequest, NextResponse } from "next/server"
import JSZip from "jszip"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { getAdminSupabase } from "@/lib/admin-supabase"
import { requireActiveAccess } from "@/lib/access-guard"
import { renderToBuffer } from "@react-pdf/renderer"
import { AnonymizedCv, type AnonymizedJobContext } from "@/lib/anonymized-cv"
import { buildExecutiveSummary } from "@/lib/anonymized-summary"
import { consumeOrgLlmActionForUser } from "@/lib/quota"
import { readOrgDefaults, readJobOptions, coerceTemplate } from "@/components/workspace/anonymize/types"
import { candidateRefSlug } from "@/lib/candidate-ref"
import type { Candidate } from "@/lib/database.types"

export const runtime = "nodejs"
export const maxDuration = 60

// Plafond de sécurité (temps de génération + quota). Au-delà, plusieurs lots.
const MAX_BATCH = 25

function safeName(s: string): string {
  return s.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60)
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: jobId } = await ctx.params
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })
  const gate = await requireActiveAccess()
  if (!gate.ok) return gate.response

  const body = await req.json().catch(() => null) as { candidate_ids?: unknown } | null
  const ids = Array.isArray(body?.candidate_ids)
    ? Array.from(new Set(body.candidate_ids.filter((x): x is string => typeof x === "string"))).slice(0, MAX_BATCH)
    : []
  if (ids.length === 0) return NextResponse.json({ error: "no_candidates" }, { status: 400 })

  const { data: profile } = await sb
    .from("profiles").select("organization_id").eq("user_id", user.id).maybeSingle()
  const orgId = profile?.organization_id
  if (!orgId) return NextResponse.json({ error: "no_organization" }, { status: 400 })

  const admin = getAdminSupabase()

  // ── Branding + gabarit cabinet (une fois) ──────────────────────────────
  const { data: org } = await sb
    .from("organizations")
    .select("brand_name, brand_logo_path, brand_color, brand_color_secondary, brand_slogan, contact_email, name, anonymize_defaults")
    .eq("id", orgId)
    .maybeSingle()
  const orgDefaults = readOrgDefaults(org?.anonymize_defaults)

  let brandLogoUrl: string | null = null
  if (org?.brand_logo_path) {
    const { data: signed } = await admin.storage.from("brand-logos").createSignedUrl(org.brand_logo_path, 60 * 60)
    brandLogoUrl = signed?.signedUrl ?? null
  }
  const brand = {
    name: (org?.brand_name?.trim() || org?.name?.trim()) || null,
    logoUrl: brandLogoUrl,
    color: org?.brand_color ?? null,
    colorSecondary: org?.brand_color_secondary ?? null,
    slogan: org?.brand_slogan ?? null,
    contactEmail: org?.contact_email ?? null,
  }

  // ── Mission : contexte + options (une fois) ────────────────────────────
  const { data: job } = await sb
    .from("jobs")
    .select("id, title, location, seniority, required_skills, nice_to_have_skills, normalized, briefing, anonymize_options")
    .eq("id", jobId)
    .single()
  if (!job) return NextResponse.json({ error: "job_not_found" }, { status: 404 })

  const jobOptions = readJobOptions(job.anonymize_options)
  const rf = job.normalized?.role_family ?? []
  const formalTitle = rf.length > 0 ? rf.slice(0, 2).join(" / ") : job.title
  const jobContext: AnonymizedJobContext = {
    title: formalTitle,
    seniority: job.seniority,
    location: job.location,
    required_skills: job.required_skills ?? [],
    nice_to_have_skills: job.nice_to_have_skills ?? [],
    must_have_skills: job.normalized?.must_have_skills ?? [],
    role_family: rf[0] ?? null,
  }
  const template = coerceTemplate(orgDefaults.template)
  const missionSafe = safeName(job.title || "mission")

  const { r2Upload } = await import("@/lib/r2-storage")
  const { incrementStorageUsed } = await import("@/lib/quota")

  const zip = new JSZip()
  const folder = zip.folder(missionSafe) ?? zip
  let generated = 0
  const skipped: string[] = []

  for (const candidateId of ids) {
    const { data: candidate } = await sb.from("candidates").select("*").eq("id", candidateId).single()
    if (!candidate || candidate.parse_status !== "parsed" || !candidate.parsed_cv) {
      skipped.push(candidateId); continue
    }

    // Quota LLM seulement si le résumé Nora est demandé (sinon zéro appel).
    let executiveSummary: string | null = null
    if (jobOptions.keepNoraSummary) {
      const q = await consumeOrgLlmActionForUser(admin, user.id)
      if (!q.ok) {
        return NextResponse.json({ error: q.code ?? "llm_quota_exceeded", message: q.message }, { status: 429 })
      }
      executiveSummary = await buildExecutiveSummary(candidate as Candidate, jobContext, "fr")
    }

    let buffer: Buffer
    try {
      buffer = Buffer.from(await renderToBuffer(
        AnonymizedCv({
          candidate: candidate as Candidate,
          reference: candidateRefSlug(candidate.id),
          job: jobContext,
          brand,
          executiveSummary,
          options: {
            template,
            keepNoraSummary: jobOptions.keepNoraSummary,
            customText: jobOptions.customText,
            watermark: orgDefaults.watermark,
            watermarkText: orgDefaults.watermarkText,
            language: "fr",
          },
        }),
      ))
    } catch {
      skipped.push(candidateId); continue
    }

    // Persistance R2 (comme l'anonymisation unitaire).
    const path = `${orgId}/${candidate.id}/anonymized.pdf`
    try {
      await r2Upload({ bucket: "cv", path, body: buffer, contentType: "application/pdf", callerOrgId: orgId })
      await incrementStorageUsed(admin, orgId, buffer.byteLength)
      await admin.from("candidates").update({
        anonymized_pdf_path: path, anonymized_at: new Date().toISOString(),
      }).eq("id", candidate.id)
    } catch {
      // Le stockage a échoué mais le PDF est bon : on le met quand même au zip.
    }

    folder.file(`C-${candidateRefSlug(candidate.id)} · ${missionSafe}.pdf`, buffer)
    generated++
  }

  if (generated === 0) {
    return NextResponse.json({ error: "nothing_generated", message: "Aucun CV n'a pu être généré." }, { status: 422 })
  }

  const zipBuffer = await zip.generateAsync({ type: "nodebuffer" })
  const date = new Date().toISOString().slice(0, 10)
  const zipName = safeName(`${brand.name ?? "Naywa"} · ${job.title} · CV anonymises · ${date}`)

  return new NextResponse(new Uint8Array(zipBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${zipName}.zip"`,
      "Cache-Control": "no-store",
      "X-Generated": String(generated),
      "X-Skipped": String(skipped.length),
    },
  })
}
