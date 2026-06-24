/**
 * POST /api/cv/:id/critique   { subject?, body, channel, job_id? }
 *
 * Nora relit un brouillon de message d'approche édité par le sourceur et
 * renvoie 0 à 4 flags courts. Appelée uniquement quand le draft a été
 * modifié — pour les messages 100% IA il n'y a rien à critiquer.
 *
 * Coût : 1 appel LLM rapide (~80 tokens output). Quota "critique" séparé
 * pour qu'on puisse suivre l'usage indépendamment du compose.
 */

import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { getAdminSupabase } from "@/lib/admin-supabase"
import { consumeQuota, consumeOrgLlmActionForUser } from "@/lib/quota"
import { openrouterChat, safeJsonParse } from "@/lib/openrouter"

export const runtime = "nodejs"
export const maxDuration = 20

const SYSTEM_PROMPT = `Tu es Nora, l'assistante de recrutement de Naywa. Le sourceur a modifié le brouillon de message d'approche que tu lui avais préparé. Tu le relis et signales 0 à 4 problèmes courts (en français) avant qu'il ne l'envoie.

Réponds UNIQUEMENT en JSON valide :
{
  "verdict": "ok" | "warn",
  "flags": [
    { "level": "info" | "warn", "text": string }   // <= 90 caractères
  ]
}

Règles :
- Sois discriminant. Si le message est correct → verdict "ok", flags [].
- Cible ce qui pourrait nuire à la réponse : ton inadapté (trop sec, trop familier, trop formel pour le profil), longueur (>200 mots = trop long), absence de mention du poste, formulations bateau ("J'espère que vous allez bien"), fautes d'orthographe évidentes, appel à l'action absent ou flou, signature manquante, jargon RH creux.
- Pas de flatterie, pas de "bonne lettre", pas de suggestions vagues. Une remarque utile vaut mieux que trois génériques.
- Chaque flag : <90 caractères, action ou diagnostic. Ex : "Ouverture générique, supprime 'J'espère que vous allez bien'", "Aucun appel à l'action clair".
- 0 flag si tout est bon. Max 4.`

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })

  const body = await req.json().catch(() => null) as {
    subject?: unknown; body?: unknown; channel?: unknown; job_id?: unknown
  } | null
  const subject = typeof body?.subject === "string" ? body.subject.trim().slice(0, 200) : ""
  const draftBody = typeof body?.body === "string" ? body.body.trim() : ""
  const channel = body?.channel === "linkedin" ? "linkedin" : "email"
  const jobId = typeof body?.job_id === "string" ? body.job_id : null
  if (!draftBody) return NextResponse.json({ error: "empty_body" }, { status: 400 })

  // Verify candidate belongs to the user.
  const { data: candidate } = await sb
    .from("candidates")
    .select("id, full_name, current_title, seniority_level")
    .eq("id", id).maybeSingle()
  if (!candidate) return NextResponse.json({ error: "not_found" }, { status: 404 })

  const quota = await consumeQuota(getAdminSupabase(), user.id, "critique")
  if (!quota.ok) {
    return NextResponse.json({ error: "quota_exceeded", message: quota.message }, { status: 429 })
  }
  const orgLlm = await consumeOrgLlmActionForUser(getAdminSupabase(), user.id)
  if (!orgLlm.ok) {
    return NextResponse.json({ error: orgLlm.code ?? "llm_quota_exceeded", message: orgLlm.message }, { status: 429 })
  }

  let jobTitle: string | null = null
  if (jobId) {
    const { data: job } = await sb.from("jobs").select("title").eq("id", jobId).maybeSingle()
    jobTitle = job?.title ?? null
  }

  const userMsg = [
    `Canal : ${channel}`,
    `Destinataire : ${candidate.full_name ?? "candidat"} (${candidate.current_title ?? "rôle inconnu"}${candidate.seniority_level ? ", " + candidate.seniority_level : ""})`,
    jobTitle ? `Poste pitché : ${jobTitle}` : null,
    subject ? `Objet : ${subject}` : null,
    "",
    "MESSAGE :",
    draftBody,
  ].filter(Boolean).join("\n")

  let result
  try {
    result = await openrouterChat({
      model: "openai/gpt-4o-mini",
      temperature: 0.2,
      responseFormat: "json_object",
      maxTokens: 280,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMsg },
      ],
    })
  } catch (err) {
    return NextResponse.json({ error: "llm_failed", detail: (err as Error).message }, { status: 502 })
  }

  const parsed = safeJsonParse<{ verdict?: unknown; flags?: unknown }>(result.content) ?? {}
  const verdict = parsed.verdict === "warn" ? "warn" : "ok"
  const rawFlags = Array.isArray(parsed.flags) ? parsed.flags : []
  const flags = rawFlags.slice(0, 4).flatMap((f) => {
    if (!f || typeof f !== "object") return []
    const o = f as Record<string, unknown>
    const text = typeof o.text === "string" ? o.text.trim().slice(0, 110) : ""
    if (!text) return []
    const level = o.level === "warn" ? "warn" : "info"
    return [{ level, text }]
  })

  return NextResponse.json({ ok: true, verdict, flags })
}
