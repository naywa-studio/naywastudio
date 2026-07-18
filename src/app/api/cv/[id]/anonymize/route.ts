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
import { openrouterChat } from "@/lib/openrouter"
import { consumeOrgLlmActionForUser } from "@/lib/quota"

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
      custom_text?: unknown
      watermark?: unknown
      language?: unknown
    }
  } | null
  const jobId = typeof body?.job_id === "string" ? body.job_id : null

  // Sanitize options : on valide chaque champ, défauts si absent/invalide.
  const optRaw = body?.options ?? {}
  const template: "classic" | "two-column" | "executive" | "bento" =
    optRaw.template === "two-column"
      ? "two-column"
      : optRaw.template === "executive"
        ? "executive"
        : optRaw.template === "bento"
          ? "bento"
          : "classic"
  const keepNoraSummary = typeof optRaw.keep_nora_summary === "boolean" ? optRaw.keep_nora_summary : true
  const customText =
    typeof optRaw.custom_text === "string" ? optRaw.custom_text.trim().slice(0, 600) : ""
  const watermark = typeof optRaw.watermark === "boolean" ? optRaw.watermark : false
  const language: "fr" | "en" = optRaw.language === "en" ? "en" : "fr"

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
      .select("brand_name, brand_logo_path, brand_color, brand_color_secondary, brand_slogan, contact_email, name")
      .eq("id", profile.organization_id)
      .maybeSingle()
    brandName = (org?.brand_name?.trim() || org?.name?.trim()) || null
    brandLogoPath = org?.brand_logo_path ?? null
    brandColor = org?.brand_color ?? null
    brandColorSecondary = org?.brand_color_secondary ?? null
    brandSlogan = org?.brand_slogan ?? null
    contactEmail = org?.contact_email ?? null
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

  // Executive summary mission-oriented — 2-3 phrases formelles qui expliquent
  // pourquoi ce profil correspond à la mission. Best-effort : si le LLM rate
  // ou prend trop de temps, on tombe sur cv.summary tel que parsé côté PDF.
  // On évite l'appel LLM si l'owner a désactivé le résumé Nora dans son
  // panneau "Personnaliser" — économise quota + latence.
  let executiveSummary: string | null = null
  if (jobContext && keepNoraSummary) {
    executiveSummary = await buildExecutiveSummary(candidate as Candidate, jobContext, language)
  }

  let buffer: Buffer
  try {
    buffer = Buffer.from(
      await renderToBuffer(
        AnonymizedCv({
          candidate: candidate as Candidate,
          reference,
          job: jobContext,
          brand,
          executiveSummary,
          options: {
            template,
            keepNoraSummary,
            customText,
            watermark,
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
    return NextResponse.json({ error: "sign_failed", detail: pErr?.message }, { status: 500 })
  }
  return NextResponse.json({
    url: previewSigned.signedUrl,                       // backward compat: preview
    preview_url: previewSigned.signedUrl,
    download_url: downloadSigned?.signedUrl ?? previewSigned.signedUrl,
    expires_in: TTL_SECONDS,
  })
}

/* ──────────────────────────────────────────────────────────────────────────
 * Executive summary mission-oriented
 *
 * Snapshot compact du candidat + de la mission envoyé au LLM, qui produit
 * 2-3 phrases formelles en français. Best-effort : on swallow toute erreur
 * (timeout, parse, key manquante) — le PDF se rendra avec cv.summary à la
 * place et le sourceur pourra ré-anonymiser plus tard.
 * ────────────────────────────────────────────────────────────────────────── */

const EXEC_SUMMARY_PROMPT_FR = `Tu es Nora, assistante recrutement Naywa. On te donne un candidat et une mission. Tu produis un résumé exécutif FACTUEL de 2 à 3 phrases (50 à 80 mots) qui synthétise objectivement le profil dans le sens de la mission.

Règles strictes :
- Réponds en JSON strict : { "summary": string }.
- LANGUE DE SORTIE : FRANÇAIS uniquement.
- Ton formel, vouvoiement. Destiné au client final du cabinet de recrutement.
- Anonymisation : JAMAIS de nom, école, coordonnées.
- ZÉRO INFÉRENCE sur ce qui n'est pas écrit : pas de "motivé", "passionné", "très impliqué", "candidat idéal", "fort potentiel", "excellent communicant". Tu n'as pas eu d'entretien, tu n'as PAS accès à ces dimensions.
- Tu te limites à ce que le CV permet de dire FACTUELLEMENT :
  années d'expérience, séniorité, compétences techniques alignées
  avec les exigences mission, types de contextes/secteurs déjà
  rencontrés. Pas plus.
- Si tu manques d'information sur un axe, tu n'en parles pas.
- Connecte 2-3 éléments du CV aux exigences mission ("X ans en Y,
  expérience sur Z et W mentionnés comme requis").
- Pas d'envolée, pas de vocabulaire commercial. Sec, précis, sourcé.
- Évite les superlatifs ("expert", "maîtrise parfaite") sauf si le
  CV les mentionne textuellement.`

const EXEC_SUMMARY_PROMPT_EN = `You are Nora, Naywa's recruitment assistant. You are given a candidate and a job. Produce a FACTUAL executive summary of 2 to 3 sentences (50 to 80 words) that objectively summarises the profile against the mission requirements.

Strict rules:
- Reply in strict JSON: { "summary": string }.
- OUTPUT LANGUAGE: ENGLISH only.
- Formal tone. The text is for the recruitment firm's end client.
- Anonymisation: NEVER mention name, school, or contact details.
- ZERO INFERENCE on what is not written: no "motivated", "passionate", "highly engaged", "perfect candidate", "high potential", "excellent communicator". You have not interviewed the candidate, you have NO access to those dimensions.
- Stay strictly within what the CV factually supports:
  years of experience, seniority, technical skills aligned with the
  job's requirements, types of contexts/industries already worked in.
  Nothing more.
- If a dimension lacks information, don't mention it.
- Connect 2-3 concrete CV facts to the job's requirements ("X years
  in Y, experience with Z and W which are listed as required").
- No flourish, no sales wording. Dry, precise, sourced.
- Avoid superlatives ("expert", "perfect mastery") unless the CV
  literally uses them.`

async function buildExecutiveSummary(
  candidate: Candidate,
  job: AnonymizedJobContext,
  language: "fr" | "en" = "fr",
): Promise<string | null> {
  try {
    const cv = candidate.parsed_cv ?? {}
    // Le snapshot reste en français côté clés (titre, ans_xp, etc.) —
    // c'est de la data structurée que le LLM lit aussi bien dans une
    // langue ou l'autre. Le PROMPT lui dicte la langue de sortie.
    const snapshot = {
      mission: {
        titre: job.title,
        seniorite_attendue: job.seniority,
        competences_must_have: job.must_have_skills.slice(0, 10),
        competences_required: job.required_skills.slice(0, 10),
      },
      candidat: {
        titre_actuel: candidate.current_title,
        ans_xp: candidate.years_experience,
        seniorite: candidate.seniority_level,
        competences_principales: (candidate.taxonomy?.core_skills?.slice(0, 12)) ?? candidate.skills?.slice(0, 12) ?? [],
        experience_recap: (cv.experience ?? []).slice(0, 4).map((e) => ({
          titre: e.title,
          societe: e.company,
          duree: [e.start, e.end ?? (language === "en" ? "present" : "présent")].filter(Boolean).join(" – "),
        })),
      },
    }

    const systemPrompt = language === "en" ? EXEC_SUMMARY_PROMPT_EN : EXEC_SUMMARY_PROMPT_FR

    const result = await openrouterChat({
      model: "openai/gpt-4o-mini",
      temperature: 0.3,
      maxTokens: 320,
      timeoutMs: 20_000,
      responseFormat: "json_object",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: JSON.stringify(snapshot) },
      ],
    })
    const parsed = JSON.parse(result.content) as { summary?: unknown }
    if (typeof parsed.summary !== "string") return null
    const text = parsed.summary.trim()
    if (text.length < 20) return null
    return text
  } catch {
    return null
  }
}
