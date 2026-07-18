/**
 * POST /api/cv/:id/compose   { channel, job_id?, instruction? }
 *
 * Generates a personalized outreach draft (email or LinkedIn message) from
 * the candidate's structured profile + an optional matched job. The draft
 * is persisted on the candidate (outreach_draft / outreach_meta) so the
 * sourcer can come back to it. Nothing is ever sent — the user copies it.
 */

import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { requireActiveAccess } from "@/lib/access-guard"
import { getAdminSupabase } from "@/lib/admin-supabase"
import { consumeQuota, consumeOrgLlmActionForUser } from "@/lib/quota"
import { openrouterChat, safeJsonParse } from "@/lib/openrouter"
import type { OutreachChannel, OutreachMeta, ParsedCv } from "@/lib/database.types"

export const runtime = "nodejs"
export const maxDuration = 30

const SYSTEM_PROMPT = `Tu es Nora, l'assistante de recrutement de Naywa Studio. Tu rédiges un message d'approche personnalisé qu'un sourceur enverra à un candidat.

Tu réponds UNIQUEMENT en JSON valide :
{ "subject": string | null, "body": string }

Règles :
- Le message est écrit À LA PREMIÈRE PERSONNE, du point de vue du sourceur, prêt à être copié-collé.
- Personnalise : appuie-toi sur le parcours réel du candidat (poste actuel, expérience marquante, compétences). Montre que ce n'est pas un copier-coller générique.
- Si une mission est fournie, oriente le message autour de cette opportunité, sans tout déballer — donne envie d'en savoir plus.
- Ton chaleureux, direct, respectueux. Pas de flatterie excessive, pas de jargon RH creux.
- Canal "email" : "subject" = objet court et accrocheur ; "body" = 90-150 mots, salutation + corps + appel à l'action léger + signature.
- Canal "linkedin" : "subject" = null ; "body" = 60-110 mots, plus direct et informel, pas de signature lourde.
- Termine par une signature au prénom du sourceur s'il est fourni, sinon "[Votre prénom]".
- Pas de markdown, pas de placeholders inutiles. Le candidat est nommé par son prénom si on le connaît.
- Propose un échange / un appel pour la suite sans inventer de lien ou de créneau spécifique : on laisse le sourceur cadrer la logistique dans son échange suivant.
- Si la mission contient un champ "briefing", il liste les contraintes/préférences du client (budget, démarrage, profils à éviter, etc.). Tiens-en compte sans le citer brut au candidat : adapte le ton, les détails évoqués et la promesse. NE révèle PAS le budget ni les info confidentielles du briefing au candidat.`

const LANG_INSTRUCTION: Record<"fr" | "en", string> = {
  fr: "\n\nÉcris le message en FRANÇAIS.",
  en: "\n\nWrite the message in ENGLISH — subject and body both, entirely in English.",
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })
  const gate = await requireActiveAccess()
  if (!gate.ok) return gate.response

  const body = await req.json().catch(() => null) as {
    channel?: unknown; job_id?: unknown; instruction?: unknown; lang?: unknown
  } | null
  const channel: OutreachChannel = body?.channel === "linkedin" ? "linkedin" : "email"
  const jobId = typeof body?.job_id === "string" ? body.job_id : null
  const instruction = typeof body?.instruction === "string" ? body.instruction.trim().slice(0, 400) : ""
  const lang = body?.lang === "en" ? "en" : "fr"

  const { data: candidate, error } = await sb.from("candidates").select("*").eq("id", id).single()
  if (error || !candidate) return NextResponse.json({ error: "not_found" }, { status: 404 })
  if (candidate.parse_status !== "parsed") {
    return NextResponse.json(
      {
        error: "not_parsed",
        message: lang === "en"
          ? "The CV must be parsed before drafting a message."
          : "Le CV doit être parsé avant de rédiger un message.",
      },
      { status: 400 },
    )
  }

  const quota = await consumeQuota(getAdminSupabase(), user.id, "compose")
  if (!quota.ok) {
    return NextResponse.json({ error: "quota_exceeded", message: quota.message }, { status: 429 })
  }
  const orgLlm = await consumeOrgLlmActionForUser(getAdminSupabase(), user.id)
  if (!orgLlm.ok) {
    return NextResponse.json({ error: orgLlm.code ?? "llm_quota_exceeded", message: orgLlm.message }, { status: 429 })
  }

  // Optional job context
  let jobTitle: string | null = null
  let jobBlock = ""
  if (jobId) {
    const { data: job } = await sb
      .from("jobs")
      .select("title, location, seniority, contract_type, description, required_skills, briefing")
      .eq("id", jobId)
      .single()
    if (job) {
      jobTitle = job.title
      jobBlock = `\n\nPOSTE À POURVOIR :\n${JSON.stringify({
        title: job.title,
        location: job.location,
        seniority: job.seniority,
        contract_type: job.contract_type,
        required_skills: job.required_skills,
        description: job.description,
        briefing: job.briefing,
      })}`
    }
  }

  // Recruiter first name for the sign-off.
  const { data: profile } = await sb
    .from("profiles")
    .select("first_name")
    .eq("user_id", user.id)
    .single()
  const recruiterName = profile?.first_name?.trim() || null

  const cv: ParsedCv = candidate.parsed_cv ?? {}
  const candidateBlock = JSON.stringify({
    full_name: candidate.full_name,
    current_title: candidate.current_title,
    current_company: candidate.current_company,
    years_experience: candidate.years_experience,
    seniority: candidate.seniority_level,
    location: candidate.location,
    skills: (candidate.taxonomy?.core_skills ?? candidate.skills ?? []).slice(0, 12),
    summary: cv.summary,
    recent_experience: (cv.experience ?? []).slice(0, 2),
  })

  const userMsg = [
    `Canal : ${channel}`,
    recruiterName ? `Prénom du sourceur (pour signer) : ${recruiterName}` : "Prénom du sourceur : inconnu",
    `CANDIDAT :\n${candidateBlock}`,
    jobBlock,
    instruction ? `\n\nCONSIGNE DU SOURCEUR : ${instruction}` : "",
  ].filter(Boolean).join("\n")

  let result
  try {
    result = await openrouterChat({
      model: "openai/gpt-4o-mini",
      temperature: 0.6,
      responseFormat: "json_object",
      maxTokens: 700,
      messages: [
        { role: "system", content: SYSTEM_PROMPT + LANG_INSTRUCTION[lang] },
        { role: "user", content: userMsg },
      ],
    })
  } catch (err) {
    return NextResponse.json(
      { error: "llm_failed", detail: (err as Error).message },
      { status: 502 },
    )
  }

  const parsed = safeJsonParse<{ subject?: unknown; body?: unknown }>(result.content)
  const draftBody = typeof parsed?.body === "string" ? parsed.body.trim() : ""
  if (!draftBody) {
    return NextResponse.json({
      error: "empty_draft",
      message: lang === "en" ? "Nora couldn't draft the message." : "Nora n'a pas pu rédiger le message.",
    }, { status: 502 })
  }
  const subject = channel === "email" && typeof parsed?.subject === "string"
    ? parsed.subject.trim() || null
    : null

  const meta: OutreachMeta = {
    channel,
    job_id: jobId,
    job_title: jobTitle,
    instruction: instruction || null,
    subject,
    generated_at: new Date().toISOString(),
  }

  await sb.from("candidates").update({
    outreach_draft: draftBody,
    outreach_meta: meta,
  }).eq("id", candidate.id)

  return NextResponse.json({ ok: true, subject, body: draftBody, meta })
}
