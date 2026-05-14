/**
 * POST /api/jobs/chat
 *
 * Conversational brief builder. The client describes a need in natural
 * language; Nora asks a couple of clarifying questions, then emits a
 * structured job draft. The draft is NOT persisted here — the UI shows it
 * for review and the user confirms via POST /api/jobs (same path as the form).
 *
 * Body:  { messages: { role: "user" | "assistant", content: string }[] }
 * Reply: { reply: string, ready: boolean, draft: JobDraft | null }
 */

import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { openrouterChat, safeJsonParse, type ORMessage } from "@/lib/openrouter"

export const runtime = "nodejs"
export const maxDuration = 30

const MAX_TURNS = 16

const SYSTEM_PROMPT = `Tu es Nora, l'assistante de recrutement de Naywa Studio. Tu aides un sourceur à formuler un besoin client (un poste à pourvoir) via une conversation courte et efficace.

Règles de conversation :
- Ton chaleureux, professionnel, concis. Tu tutoies l'utilisateur.
- Pose UNE seule question à la fois. Maximum 2-3 questions au total — ne sur-interroge jamais.
- Vise l'essentiel : intitulé du poste, séniorité, 2-4 compétences clés. Le lieu et le type de contrat sont un bonus.
- Si le premier message contient déjà assez d'infos, passe directement à un brouillon (ready = true).
- Quand tu proposes un brouillon, ton "reply" doit être une phrase courte qui invite à valider ou ajuster.

Tu réponds TOUJOURS et UNIQUEMENT en JSON valide, ce schéma exact :
{
  "reply":  string,              // ton message à l'utilisateur
  "ready":  boolean,             // true seulement quand le brouillon est exploitable
  "draft":  null | {
    "title":               string,
    "location":            string | null,
    "seniority":           "junior" | "mid" | "senior" | "lead" | "principal" | null,
    "contract_type":       string | null,
    "required_skills":     string[],
    "nice_to_have_skills": string[],
    "description":         string
  }
}

- Tant que "ready" est false, "draft" = null.
- "description" : 2-4 phrases neutres qui résument le besoin, rédigées par toi.
- Pas de markdown, pas de texte hors du JSON.`

interface JobDraft {
  title: string
  location: string | null
  seniority: string | null
  contract_type: string | null
  required_skills: string[]
  nice_to_have_skills: string[]
  description: string
}

export async function POST(req: NextRequest) {
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })

  const body = await req.json().catch(() => null) as { messages?: unknown } | null
  const raw = Array.isArray(body?.messages) ? body!.messages : []

  const history: ORMessage[] = []
  for (const m of raw) {
    if (!m || typeof m !== "object") continue
    const o = m as Record<string, unknown>
    const role = o.role === "assistant" ? "assistant" : o.role === "user" ? "user" : null
    const content = typeof o.content === "string" ? o.content.trim() : ""
    if (!role || !content) continue
    history.push({ role, content })
  }
  if (history.length === 0) {
    return NextResponse.json({ error: "empty_conversation" }, { status: 400 })
  }
  // Keep the context bounded.
  const trimmed = history.slice(-MAX_TURNS)

  let result
  try {
    result = await openrouterChat({
      model: "openai/gpt-4o-mini",
      temperature: 0.4,
      responseFormat: "json_object",
      maxTokens: 900,
      messages: [{ role: "system", content: SYSTEM_PROMPT }, ...trimmed],
    })
  } catch (err) {
    return NextResponse.json(
      { error: "llm_failed", detail: (err as Error).message },
      { status: 502 },
    )
  }

  const parsed = safeJsonParse<{ reply?: unknown; ready?: unknown; draft?: unknown }>(result.content)
  if (!parsed) {
    return NextResponse.json({
      reply: "Désolée, je n'ai pas réussi à formuler ça. Tu peux reformuler ton besoin ?",
      ready: false,
      draft: null,
    })
  }

  const reply = typeof parsed.reply === "string" && parsed.reply.trim()
    ? parsed.reply.trim()
    : "C'est noté."
  const ready = parsed.ready === true

  let draft: JobDraft | null = null
  if (ready && parsed.draft && typeof parsed.draft === "object") {
    const d = parsed.draft as Record<string, unknown>
    const str = (v: unknown): string | null => {
      if (typeof v !== "string") return null
      const t = v.trim()
      return t.length ? t : null
    }
    const arr = (v: unknown): string[] =>
      Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean).slice(0, 20) : []
    const title = str(d.title)
    if (title) {
      draft = {
        title,
        location: str(d.location),
        seniority: str(d.seniority),
        contract_type: str(d.contract_type),
        required_skills: arr(d.required_skills),
        nice_to_have_skills: arr(d.nice_to_have_skills),
        description: str(d.description) ?? "",
      }
    }
  }

  return NextResponse.json({ reply, ready: ready && !!draft, draft })
}
