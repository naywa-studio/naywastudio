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
import { requireActiveAccess } from "@/lib/access-guard"
import { getAdminSupabase } from "@/lib/admin-supabase"
import { renderToBuffer } from "@react-pdf/renderer"
import { AnonymizedCv, type AnonymizedJobContext } from "@/lib/anonymized-cv"
import type { Candidate } from "@/lib/database.types"
import { buildExecutiveSummary } from "@/lib/anonymized-summary"
import { consumeOrgLlmActionForUser } from "@/lib/quota"
import {
  readOrgDefaults, readJobOptions, coerceTemplate,
  INITIAL_ORG_ANONYMIZE_DEFAULTS, INITIAL_JOB_ANONYMIZE_OPTIONS,
} from "@/components/workspace/anonymize/types"
import { readSelection, readOrder, applyLayout } from "@/lib/anonymize-selection"

export const runtime = "nodejs"
export const maxDuration = 30

const TTL_SECONDS = 5 * 60

import { candidateRefSlug as refFor } from "@/lib/candidate-ref"

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })
  const gate = await requireActiveAccess()
  if (!gate.ok) return gate.response

  // Anonymisation déclenche un appel LLM (résumé exécutif) — quota org mensuel.
  const orgLlm = await consumeOrgLlmActionForUser(getAdminSupabase(), user.id)
  if (!orgLlm.ok) {
    return NextResponse.json({ error: orgLlm.code ?? "llm_quota_exceeded", message: orgLlm.message }, { status: 429 })
  }

  // Body schema :
  //   job_id  : mission ciblée (oriente le résumé Nora)
  //   options : choix du sourceur dans le panneau "Personnaliser"
  //             (cf. AnonymizeOptions côté client)
  const body = await req.json().catch(() => null) as {
    job_id?: unknown
    options?: {
      template?: unknown
      keep_nora_summary?: unknown
      keep_candidate_summary?: unknown
      custom_text?: unknown
      watermark?: unknown
      language?: unknown
    }
  } | null
  const jobId = typeof body?.job_id === "string" ? body.job_id : null

  // Overrides éventuels passés dans le body (rétro-compat fiche match + appel
  // ponctuel). La SOURCE DE VÉRITÉ est en base : défauts cabinet
  // (organizations.anonymize_defaults) + options mission (jobs.anonymize_options),
  // fusionnés plus bas une fois org + job chargés. Un champ de body non fourni
  // (undefined) laisse gagner la valeur persistée.
  const optRaw = body?.options ?? {}
  const bodyTemplate = optRaw.template
  const bodyKeepNora = typeof optRaw.keep_nora_summary === "boolean" ? optRaw.keep_nora_summary : undefined
  const bodyKeepCandidate = typeof optRaw.keep_candidate_summary === "boolean" ? optRaw.keep_candidate_summary : undefined
  const bodyCustomText = typeof optRaw.custom_text === "string" ? optRaw.custom_text : undefined
  const bodyWatermark = typeof optRaw.watermark === "boolean" ? optRaw.watermark : undefined
  const language: "fr" | "en" = optRaw.language === "en" ? "en" : "fr"
  // Défauts, écrasés par les valeurs DB au chargement org/job.
  let orgDefaults = INITIAL_ORG_ANONYMIZE_DEFAULTS
  let jobOptions = INITIAL_JOB_ANONYMIZE_OPTIONS

  const { data: candidate, error } = await sb.from("candidates").select("*").eq("id", id).single()
  if (error || !candidate) return NextResponse.json({ error: "not_found" }, { status: 404 })
  if (candidate.parse_status !== "parsed" || !candidate.parsed_cv) {
    return NextResponse.json(
      { error: "not_parsed", message: "Le CV doit être parsé avant d'être anonymisé." },
      { status: 400 },
    )
  }

  // Per-cabinet brand — name + signed logo URL (1h) so the PDF carries
  // the cabinet's identity instead of Naywa's by default. Reads from
  // organizations (the source of truth) via the caller's profile.
  const { data: profile } = await sb
    .from("profiles").select("organization_id").eq("user_id", user.id).maybeSingle()

  let brandName: string | null = null
  let brandLogoPath: string | null = null
  let brandColor: string | null = null
  let brandColorSecondary: string | null = null
  let brandSlogan: string | null = null
  let contactEmail: string | null = null
  if (profile?.organization_id) {
    const { data: org } = await sb
      .from("organizations")
      .select("brand_name, brand_logo_path, brand_color, brand_color_secondary, brand_slogan, contact_email, name, anonymize_defaults")
      .eq("id", profile.organization_id)
      .maybeSingle()
    brandName = (org?.brand_name?.trim() || org?.name?.trim()) || null
    brandLogoPath = org?.brand_logo_path ?? null
    brandColor = org?.brand_color ?? null
    brandColorSecondary = org?.brand_color_secondary ?? null
    brandSlogan = org?.brand_slogan ?? null
    contactEmail = org?.contact_email ?? null
    orgDefaults = readOrgDefaults(org?.anonymize_defaults)
  }

  let brandLogoUrl: string | null = null
  if (brandLogoPath) {
    const adminTmp = getAdminSupabase()
    const { data: signed } = await adminTmp.storage
      .from("brand-logos")
      .createSignedUrl(brandLogoPath, 60 * 60)
    brandLogoUrl = signed?.signedUrl ?? null
  }
  const brand = {
    name: brandName,
    logoUrl: brandLogoUrl,
    color: brandColor,
    colorSecondary: brandColorSecondary,
    slogan: brandSlogan,
    contactEmail,
  }

  // Pull the job to orient the PDF — title, must-have skills, briefing.
  // Optional: a job-less anonymisation falls back to the generic template.
  let jobContext: AnonymizedJobContext | null = null
  if (jobId) {
    const { data: job } = await sb
      .from("jobs")
      .select("id, title, location, seniority, required_skills, nice_to_have_skills, normalized, briefing, anonymize_options")
      .eq("id", jobId)
      .single()
    if (job) {
      jobOptions = readJobOptions(job.anonymize_options)
      // Titre affiché au client = CELUI DE LA MISSION, tel que le sourceur
      // l'a écrit. On substituait auparavant le `role_family` normalisé par le
      // modèle, au motif qu'il « sonnait plus formel » — mais il faisait
      // apparaître sur un document client un intitulé que personne n'avait
      // tapé, et que personne ne pouvait corriger. Maintenant que le titre
      // s'édite directement depuis l'aperçu, la substitution n'a plus de
      // raison d'être : ce qu'on lit est ce qu'on a écrit.
      const rf = job.normalized?.role_family ?? []

      jobContext = {
        title: job.title,
        seniority: job.seniority,
        location: job.location,
        required_skills: job.required_skills ?? [],
        nice_to_have_skills: job.nice_to_have_skills ?? [],
        must_have_skills: job.normalized?.must_have_skills ?? [],
        role_family: rf[0] ?? null,
      }
    }
  }

  // ── Options effectives : DB (org gabarit + mission contenu), un override de
  //    body non-undefined gagne (rétro-compat fiche match / appel ponctuel). ──
  const template = coerceTemplate(bodyTemplate ?? orgDefaults.template)
  const watermark = bodyWatermark ?? orgDefaults.watermark
  const watermarkText = orgDefaults.watermarkText
  const keepNoraSummary = bodyKeepNora ?? jobOptions.keepNoraSummary
  const keepCandidateSummary = bodyKeepCandidate ?? jobOptions.keepCandidateSummary
  // Message d'accompagnement : il vit sur le MATCH depuis la migration 084.
  // Résolu plus bas, une fois la ligne de match lue — un override de body
  // continue de gagner (appel ponctuel depuis la fiche match).
  let customText = (bodyCustomText ?? "").trim().slice(0, 600)

  const reference = refFor(candidate.id)

  // ── Briques masquées pour CETTE mission ──────────────────────────────────
  //
  // Arbitrage de présentation propre au client (le poste chez son concurrent,
  // le job étudiant sans rapport). On travaille sur une COPIE : `parsed_cv`
  // reste intact en base, et rien de ce filtrage ne redescend dans le vivier
  // ni dans le matching.
  //
  // Le filtrage a lieu AVANT le résumé exécutif : un résumé qui vanterait une
  // expérience absente du document serait pire que pas de résumé du tout.
  let subject = candidate as Candidate
  if (jobId && candidate.parsed_cv) {
    const { data: matchRow } = await sb
      .from("match_assessments")
      .select("anonymize_excluded, anonymize_order, anonymize_custom_text")
      .eq("job_id", jobId)
      .eq("candidate_id", candidate.id)
      // `limit(1)` volontaire : sans lui, deux lignes pour un même couple
      // feraient échouer `maybeSingle`, et le document partirait chez le
      // client avec les briques que le sourceur croyait avoir masquées.
      .limit(1)
      .maybeSingle()
    if (matchRow?.anonymize_excluded || matchRow?.anonymize_order) {
      subject = {
        ...subject,
        parsed_cv: applyLayout(
          candidate.parsed_cv,
          readSelection(matchRow.anonymize_excluded),
          readOrder(matchRow.anonymize_order),
        ),
      }
    }
    // Le message enregistré sur le match ne s'applique que si l'appel n'en a
    // pas fourni un : la fiche match envoie ce qu'elle a à l'écran, y compris
    // avant enregistrement.
    if (!customText) {
      customText = (matchRow?.anonymize_custom_text ?? "").trim().slice(0, 600)
    }
  }

  // Executive summary mission-oriented — 2-3 phrases formelles qui expliquent
  // pourquoi ce profil correspond à la mission. Best-effort : si le LLM rate
  // ou prend trop de temps, on tombe sur cv.summary tel que parsé côté PDF.
  // On évite l'appel LLM si l'owner a désactivé le résumé Nora dans son
  // panneau "Personnaliser" — économise quota + latence.
  let executiveSummary: string | null = null
  if (jobContext && keepNoraSummary) {
    executiveSummary = await buildExecutiveSummary(subject, jobContext, language)
  }

  let buffer: Buffer
  try {
    buffer = Buffer.from(
      await renderToBuffer(
        AnonymizedCv({
          candidate: subject,
          reference,
          job: jobContext,
          brand,
          executiveSummary,
          options: {
            template,
            keepNoraSummary,
            keepCandidateSummary,
            customText,
            watermark,
            watermarkText,
            language,
          },
        }),
      ),
    )
  } catch (err) {
    return NextResponse.json(
      { error: "render_failed", detail: (err as Error).message },
      { status: 500 },
    )
  }

  const admin = getAdminSupabase()
  const orgId = profile?.organization_id
  if (!orgId) {
    return NextResponse.json({ error: "no_organization" }, { status: 400 })
  }
  const { r2Upload, r2SignedUrl } = await import("@/lib/r2-storage")
  const { incrementStorageUsed } = await import("@/lib/quota")

  const path = `${orgId}/${candidate.id}/anonymized.pdf`
  try {
    await r2Upload({
      bucket: "cv",
      path,
      body: buffer,
      contentType: "application/pdf",
      callerOrgId: orgId,
    })
  } catch (err) {
    console.error("[cv/anonymize] R2 upload error:", err instanceof Error ? err.message : "unknown")
    return NextResponse.json({ error: "storage_failed" }, { status: 500 })
  }

  // Bump storage_used_bytes par la taille du PDF généré.
  await incrementStorageUsed(admin, orgId, buffer.byteLength)

  await admin.from("candidates").update({
    anonymized_pdf_path: path,
    anonymized_at: new Date().toISOString(),
  }).eq("id", candidate.id)

  // Marqueur « présenté au client » par (candidat × mission) quand
  // l'anonymisation vise une mission (fiche match) → Revue client. Première
  // anonymisation seulement (on ne réécrit pas la date).
  if (jobId) {
    await admin.from("match_assessments")
      .update({ anonymized_at: new Date().toISOString() })
      .eq("job_id", jobId).eq("candidate_id", candidate.id).is("anonymized_at", null)
  }

  // Two signed URLs : preview inline + download forcé.
  const [previewUrl, downloadUrl] = await Promise.all([
    r2SignedUrl({ bucket: "cv", path, callerOrgId: orgId, ttlSeconds: TTL_SECONDS }),
    r2SignedUrl({
      bucket: "cv", path, callerOrgId: orgId, ttlSeconds: TTL_SECONDS,
      filename: `profil-anonymise-${reference}.pdf`,
    }),
  ])

  return NextResponse.json({
    ok: true,
    url: previewUrl,                                  // backward compat
    preview_url: previewUrl,
    download_url: downloadUrl,
    reference,
  })
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })
  // Anti-extraction : en lecture seule on bloque AUSSI le téléchargement d'un
  // anonymisé déjà généré (le CV anonymisé est le livrable — sa récupération
  // hors abonnement actif serait une fuite de valeur). La consultation des CV
  // ORIGINAUX reste ouverte (route signed-url, non gardée).
  const gate = await requireActiveAccess()
  if (!gate.ok) return gate.response

  const { data: candidate, error } = await sb
    .from("candidates")
    .select("user_id, organization_id, anonymized_pdf_path, id")
    .eq("id", id)
    .single()
  if (error || !candidate) return NextResponse.json({ error: "not_found" }, { status: 404 })
  if (!candidate.anonymized_pdf_path) return NextResponse.json({ error: "no_file" }, { status: 404 })

  const orgId = candidate.organization_id
  const looksR2Scoped = !!orgId && candidate.anonymized_pdf_path.startsWith(orgId + "/")

  let previewSigned: { signedUrl: string } | null = null
  let downloadSigned: { signedUrl: string } | null = null
  let pErr: { message: string } | null = null

  if (looksR2Scoped) {
    const { r2SignedUrl } = await import("@/lib/r2-storage")
    try {
      const [p, d] = await Promise.all([
        r2SignedUrl({ bucket: "cv", path: candidate.anonymized_pdf_path, callerOrgId: orgId, ttlSeconds: TTL_SECONDS }),
        r2SignedUrl({
          bucket: "cv", path: candidate.anonymized_pdf_path, callerOrgId: orgId, ttlSeconds: TTL_SECONDS,
          filename: `profil-anonymise-${refFor(candidate.id)}.pdf`,
        }),
      ])
      previewSigned = { signedUrl: p }
      downloadSigned = { signedUrl: d }
    } catch (err) {
      pErr = { message: err instanceof Error ? err.message : "r2_sign_failed" }
    }
  } else {
    // Fallback Supabase Storage pour les anciens fichiers.
    const admin = getAdminSupabase()
    const [pRes, dRes] = await Promise.all([
      admin.storage.from("cv-uploads").createSignedUrl(candidate.anonymized_pdf_path, TTL_SECONDS),
      admin.storage.from("cv-uploads").createSignedUrl(candidate.anonymized_pdf_path, TTL_SECONDS, {
        download: `profil-anonymise-${refFor(candidate.id)}.pdf`,
      }),
    ])
    previewSigned = pRes.data
    downloadSigned = dRes.data
    pErr = pRes.error
  }
  if (pErr || !previewSigned) {
    console.error("[cv/anonymize] sign failed:", pErr?.message)
    return NextResponse.json({ error: "sign_failed", detail: "internal_error" }, { status: 500 })
  }
  return NextResponse.json({
    url: previewSigned.signedUrl,                       // backward compat: preview
    preview_url: previewSigned.signedUrl,
    download_url: downloadSigned?.signedUrl ?? previewSigned.signedUrl,
    expires_in: TTL_SECONDS,
  })
}

