/**
 * POST /api/apply/[token]   (multipart/form-data)
 *
 * Le formulaire public de candidature (Slice 6.1 / E2). Pas de session —
 * accessible par n'importe qui possédant le lien d'une mission ouverte.
 *
 * Pipeline : rate-limit IP → honeypot → validation champs/fichier → quota
 * org (storage + CV + LLM, comme l'upload authentifié) → création candidat
 * → upload R2 → parsing (lib/candidate-parse.ts) → scoring (lib/candidate-
 * score-one.ts) → email de confirmation. Réutilise EXACTEMENT la même
 * logique que le flux sourceur authentifié pour parse/score — seule la
 * façon d'identifier l'org (via le jeton de mission, pas une session) et
 * l'absence de quota "par utilisateur" (remplacé par le rate-limit IP)
 * diffèrent.
 *
 * Champs V1 (volontairement resserrés — TJM/expérience/portfolio pas
 * demandés en V1, ajoutables plus tard sans migration bloquante) :
 * full_name, email, phone (optionnel), location (optionnel),
 * linkedin_url (optionnel), message (optionnel), cv (fichier, requis),
 * talent_pool_consent (checkbox), website (honeypot, doit rester vide).
 */

import { NextRequest, NextResponse } from "next/server"
import { getAdminSupabase } from "@/lib/admin-supabase"
import { r2Upload } from "@/lib/r2-storage"
import { checkStorageQuota, incrementStorageUsed, atomicInsertCandidateUnderCvQuota, consumeOrgLlmAction } from "@/lib/quota"
import { parseCandidateCv } from "@/lib/candidate-parse"
import { scoreOneCandidate } from "@/lib/candidate-score-one"
import { checkApplyRateLimit, clientIp, hashIp } from "@/lib/apply-rate-limit"
import { sendApplyConfirmationEmail } from "@/lib/apply-confirmation-email"
import type { Candidate, Job } from "@/lib/database.types"

export const runtime = "nodejs"
export const maxDuration = 90

const MAX_BYTES = 10 * 1024 * 1024
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  const admin = getAdminSupabase()

  const { data: job } = await admin
    .from("jobs")
    .select("*")
    .eq("apply_token", token)
    .maybeSingle()
  if (!job || job.status !== "open") {
    // Même réponse qu'un jeton inconnu — ne révèle pas qu'une mission existe
    // mais est fermée aux candidatures.
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }
  const orgId = job.organization_id
  const jobRow = job as Job

  const ip = clientIp(req)
  const ipHash = hashIp(ip)

  const rate = await checkApplyRateLimit(admin, ipHash)
  if (!rate.ok) {
    await admin.from("public_form_submissions").insert({
      job_id: jobRow.id, organization_id: orgId, ip_hash: ipHash, status: "rejected_rate_limit",
    })
    return NextResponse.json({ error: "rate_limited" }, { status: 429 })
  }

  const form = await req.formData().catch(() => null)
  if (!form) return NextResponse.json({ error: "invalid_body" }, { status: 400 })

  // Honeypot : champ caché côté formulaire, invisible pour un humain, que
  // seuls les bots remplissent. Rejet SILENCIEUX (même forme de réponse
  // qu'un succès) — ne pas indiquer au bot qu'il a été détecté.
  const honeypot = form.get("website")
  if (typeof honeypot === "string" && honeypot.trim() !== "") {
    await admin.from("public_form_submissions").insert({
      job_id: jobRow.id, organization_id: orgId, ip_hash: ipHash, status: "rejected_honeypot",
    })
    return NextResponse.json({ ok: true })
  }

  const fullName = String(form.get("full_name") ?? "").trim().slice(0, 200)
  const email = String(form.get("email") ?? "").trim().slice(0, 200)
  const phone = String(form.get("phone") ?? "").trim().slice(0, 40) || null
  const location = String(form.get("location") ?? "").trim().slice(0, 200) || null
  const linkedinUrl = String(form.get("linkedin_url") ?? "").trim().slice(0, 500) || null
  const message = String(form.get("message") ?? "").trim().slice(0, 4000) || null
  const talentPoolConsent = form.get("talent_pool_consent") === "on"
  const file = form.get("cv")

  if (!fullName || !email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "invalid_fields", message: "Nom et email valide requis." }, { status: 400 })
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "missing_file" }, { status: 400 })
  }
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json({ error: "invalid_type", message: "Seuls les PDF sont acceptés." }, { status: 400 })
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "empty_file" }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "too_large", message: "Fichier > 10 Mo." }, { status: 400 })
  }

  // Storage + CV quota de l'org — un formulaire public ne doit pas pouvoir
  // faire dépasser le plafond du cabinet plus qu'un upload interne ne le
  // pourrait. Pas de check "par utilisateur" (Niveau 1 de l'upload
  // authentifié) : le rate-limit IP ci-dessus en tient lieu ici.
  const storageCheck = await checkStorageQuota(admin, orgId, file.size)
  if (!storageCheck.ok) {
    return NextResponse.json({ error: storageCheck.code ?? "storage_quota_exceeded" }, { status: 413 })
  }
  const llmCheck = await consumeOrgLlmAction(admin, orgId)
  if (!llmCheck.ok) {
    return NextResponse.json({ error: llmCheck.code ?? "llm_quota_exceeded" }, { status: 429 })
  }

  // Doublon (même org + même fichier) — même logique que /api/cv/upload,
  // pour ne pas payer un 2e passage de parsing/quota sur un re-upload.
  const { data: existingDupes } = await admin
    .from("candidates")
    .select("*")
    .eq("organization_id", orgId)
    .eq("cv_file_name", file.name)
    .eq("cv_file_size", file.size)
    .order("created_at", { ascending: true })
    .limit(10)
  const dupes = existingDupes ?? []
  const activeDupe = dupes.find((d) => !((d.tags ?? []) as string[]).includes("ancien"))
  if (activeDupe) {
    await admin.from("public_form_submissions").insert({
      job_id: jobRow.id, organization_id: orgId, ip_hash: ipHash, email, status: "accepted", candidate_id: activeDupe.id,
    })
    return NextResponse.json({ ok: true, duplicate: true })
  }

  const insert = await atomicInsertCandidateUnderCvQuota(admin, {
    userId: jobRow.user_id,
    orgId,
    fileName: file.name,
    fileSize: file.size,
    mimeType: file.type || "application/pdf",
  })
  if (!insert.ok || !insert.candidate) {
    if (insert.code === "cv_quota_exceeded") {
      return NextResponse.json({ error: "cv_quota_exceeded" }, { status: 413 })
    }
    return NextResponse.json({ error: "db_insert_failed" }, { status: 500 })
  }
  const created = insert.candidate

  // Consentement + mention déclarative posés à la création (candidat_by =
  // NULL : c'est LUI qui a coché, pas un sourceur qui le déclare pour lui —
  // distinction conservée dans le schéma depuis la Slice 1).
  await admin.from("candidates").update({
    talent_pool_consent: talentPoolConsent,
    talent_pool_consent_at: talentPoolConsent ? new Date().toISOString() : null,
  }).eq("id", created.id)

  const safeName = (() => {
    let n = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/\.{2,}/g, ".")
    n = n.replace(/^\.+/, "")
    return n.slice(0, 120) || "cv.pdf"
  })()
  const storagePath = `${orgId}/${created.id}/${safeName}`
  const buf = Buffer.from(await file.arrayBuffer())
  try {
    await r2Upload({ bucket: "cv", path: storagePath, body: buf, contentType: "application/pdf", callerOrgId: orgId })
  } catch (err) {
    console.error("[apply] R2 upload error:", err instanceof Error ? err.message : "unknown")
    await admin.from("candidates").update({ parse_status: "error", parse_error: "Upload R2 failed" }).eq("id", created.id)
    return NextResponse.json({ error: "storage_upload_failed" }, { status: 500 })
  }
  await incrementStorageUsed(admin, orgId, file.size)
  await admin.from("candidates").update({ cv_file_path: storagePath }).eq("id", created.id)

  const parseOutcome = await parseCandidateCv(admin, {
    id: created.id,
    user_id: jobRow.user_id,
    organization_id: orgId,
    cv_file_path: storagePath,
    tags: null,
    taxonomy: null,
  })

  // Rattrape les champs saisis dans le formulaire quand le parsing n'a pas
  // trouvé mieux — parseCandidateCv écrase full_name/email/phone/location
  // avec ce que le LLM a lu dans le CV (comportement voulu pour l'upload
  // interne, où il n'y a rien à préserver) ; ici on a des données saisies
  // par le candidat lui-même, à ne pas perdre si le CV ne les répète pas.
  {
    const { data: afterParse } = await admin
      .from("candidates")
      .select("full_name, email, phone, location, linkedin_url")
      .eq("id", created.id)
      .single()
    await admin.from("candidates").update({
      full_name: afterParse?.full_name ?? fullName,
      email: afterParse?.email ?? email,
      phone: afterParse?.phone ?? phone,
      location: afterParse?.location ?? location,
      linkedin_url: afterParse?.linkedin_url ?? linkedinUrl,
      notes: message ? `Message du candidat (formulaire public) :\n${message}` : null,
    }).eq("id", created.id)
  }

  if (parseOutcome.kind === "success") {
    const { data: candidateForScoring } = await admin
      .from("candidates").select("*").eq("id", created.id).single()
    if (candidateForScoring) {
      // Best-effort : une mission sans critères configurés (criteria_locked_at
      // NULL) ne bloque pas la candidature, le sourceur pourra scorer plus
      // tard depuis la fiche mission. On log pour ne pas que ça reste
      // silencieux si ça arrive souvent en pratique.
      const scoreOutcome = await scoreOneCandidate(admin, {
        candidate: candidateForScoring as unknown as Candidate,
        job: jobRow,
        userId: jobRow.user_id,
        source: "applied",
      })
      if (scoreOutcome.kind !== "success") {
        console.log(`[apply] scoring non effectué pour ${created.id}: ${scoreOutcome.kind}`)
      }
    }
  }

  await admin.from("public_form_submissions").insert({
    job_id: jobRow.id, organization_id: orgId, ip_hash: ipHash, email, status: "accepted", candidate_id: created.id,
  })

  const { data: org } = await admin
    .from("organizations").select("name, brand_name, contact_email").eq("id", orgId).single()
  const orgLabel = org?.brand_name?.trim() || org?.name?.trim() || "Ce cabinet"
  const contactEmail = org?.contact_email?.trim() || "contact@naywastudio.com"

  try {
    await sendApplyConfirmationEmail({
      candidateEmail: email,
      candidateFirstName: fullName.split(/\s+/)[0] ?? null,
      candidateId: created.id,
      jobTitle: jobRow.title,
      orgLabel,
      contactEmail,
    })
  } catch (err) {
    // Best-effort : la candidature est déjà enregistrée, un email raté ne
    // doit pas faire échouer la soumission côté candidat.
    console.error("[apply] confirmation email failed:", err instanceof Error ? err.message : "unknown")
  }

  return NextResponse.json({ ok: true })
}
