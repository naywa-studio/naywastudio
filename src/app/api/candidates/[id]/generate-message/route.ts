/**
 * POST /api/candidates/[id]/generate-message
 * Generates a personalized outreach message for a validated candidate.
 * Uses the mission brief (stored in mission.brief) as context.
 */

import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { createClient } from "@supabase/supabase-js"
import { cookies } from "next/headers"
import type { Database } from "@/lib/database.types"
import type { MissionBrief, ScoreDimensions } from "@/lib/database.types"

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: candidateId } = await params
  const cookieStore = await cookies()
  const sb = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try { toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {}
        },
      },
    }
  )

  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Load candidate + mission brief in one go
  const { data: candidate } = await sb
    .from("candidates")
    .select("*, missions!inner(brief, title, agent_level)")
    .eq("id", candidateId)
    .eq("user_id", user.id)
    .single()

  if (!candidate) return NextResponse.json({ error: "Candidate not found" }, { status: 404 })

  // Load recruiter profile for personalization
  const { data: profile } = await sb
    .from("profiles")
    .select("first_name")
    .eq("user_id", user.id)
    .single()

  const brief = (candidate as unknown as { missions: { brief: MissionBrief | null; title: string } }).missions?.brief
  const missionTitle = (candidate as unknown as { missions: { title: string } }).missions?.title ?? ""
  const recruiterName = profile?.first_name ?? "L'équipe"

  const source = candidate.source ?? "linkedin"
  const seniority = candidate.seniority_level ?? null
  const dims = candidate.score_dimensions as ScoreDimensions | null

  // Source-specific context
  const sourceContext = source === "malt"
    ? `freelance actif sur Malt${seniority && seniority !== "Inconnu" ? ` (niveau ${seniority})` : ""}`
    : source === "apec"
    ? `cadre référencé APEC${seniority && seniority !== "Inconnu" ? `, profil ${seniority}` : ""}`
    : `profil LinkedIn${seniority && seniority !== "Inconnu" ? ` — niveau ${seniority}` : ""}`

  const keywords = Array.isArray(candidate.keywords)
    ? candidate.keywords.slice(0, 4).join(", ")
    : ""

  // Identify the strongest scoring dimension to personalize the message
  let highlightReason = candidate.score_justification ?? ""
  if (dims) {
    const numericDims = Object.entries(dims)
      .filter((entry): entry is [string, number] => typeof entry[1] === "number")
    const topDim = numericDims.sort(([, a], [, b]) => b - a)[0]?.[0]
    const dimLabels: Record<string, string> = {
      competences:  "ses compétences techniques très alignées",
      seniorite:    "son niveau d'expérience correspondant exactement",
      localisation: "sa localisation idéale",
      qualite:      "la qualité et la richesse de son parcours",
    }
    if (topDim && !highlightReason) {
      highlightReason = dimLabels[topDim] ?? ""
    }
  }

  const prompt = `Tu es un expert en recrutement. Rédige un message de prise de contact professionnel et personnalisé.

CONTEXTE MISSION :
- Recruteur : ${recruiterName}
- Poste recherché : ${brief?.titre_poste ?? missionTitle}
- Localisation : ${brief?.localisation ?? "France"}
- Compétences clés : ${brief?.mots_cles ? (Array.isArray(brief.mots_cles) ? brief.mots_cles.join(", ") : brief.mots_cles) : keywords}
- Critères : ${brief?.criteres ?? "non précisé"}

PROFIL CANDIDAT :
- Nom : ${candidate.name_estimated ?? "le/la candidat(e)"}
- Titre actuel : ${candidate.title_estimated ?? "non précisé"}
- Entreprise : ${candidate.company ?? "non précisée"}
- Profil : ${sourceContext}
- Compétences identifiées : ${keywords || "non précisées"}
${highlightReason ? `- Raison de la sélection : ${highlightReason}` : ""}

RÈGLES STRICTES :
- 3-4 phrases maximum, naturel et chaleureux
- Mentionner 1 élément SPÉCIFIQUE du profil (titre exact, entreprise, ou compétence clé)
- Ne jamais mentionner de salaire, score, plateforme ou outil de recrutement
- Terminer par une question ouverte ou proposition d'échange de 30 min
- Ton : professionnel mais humain, jamais formel ou robotique
- Interdits : "J'espère que ce message vous trouve bien", formule de politesse finale, signature

Réponds UNIQUEMENT avec le message.`

  const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY
  if (!OPENROUTER_KEY) return NextResponse.json({ error: "OpenRouter not configured" }, { status: 500 })

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENROUTER_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL ?? "https://nawastudio.com",
      "X-Title": "Naywa Studio Nora",
    },
    body: JSON.stringify({
      model: "openai/gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.72,
      max_tokens: 300,
    }),
  })

  if (!res.ok) return NextResponse.json({ error: "LLM error" }, { status: 502 })

  const llmData = await res.json() as { choices: Array<{ message: { content: string } }> }
  const message = llmData.choices[0]?.message?.content?.trim() ?? ""

  // Save to DB using service role (bypasses RLS)
  const sbAdmin = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  await sbAdmin
    .from("candidates")
    .update({ message_draft: message, status: "shortlisted" })
    .eq("id", candidateId)

  return NextResponse.json({ ok: true, message_draft: message })
}
