/**
 * POST /api/assistant   { messages }
 *
 * The floating "✦ Nora" assistant. Answers questions about the user's own
 * vivier and jobs. Nora is given a compact snapshot of the data and is
 * instructed to answer ONLY from it — no hallucinated candidates.
 */

import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { requireActiveAccess } from "@/lib/access-guard"
import { getAdminSupabase } from "@/lib/admin-supabase"
import { consumeQuota, consumeOrgLlmActionForUser } from "@/lib/quota"
import { openrouterChat, type ORMessage } from "@/lib/openrouter"

export const runtime = "nodejs"
export const maxDuration = 30

const MAX_TURNS = 14
const MAX_CANDIDATES = 160
const MAX_JOBS = 60

const SYSTEM_PROMPT = `Tu es Nora, l'assistante de Naywa Studio. Tu réponds aux questions d'un sourceur sur SON vivier de CVs et SES missions.

Règles strictes :
- Tu n'as accès QU'aux données fournies dans le bloc CONTEXTE. N'invente jamais un candidat, une compétence ou une mission qui n'y figure pas.
- Cite les candidats par leur nom. Si utile, mentionne leur poste actuel (intitulé du job qu'ils occupent aujourd'hui) ou leurs tags.
- Si la réponse n'est pas dans les données, dis-le clairement ("Je ne vois personne avec ça dans ton vivier" / "Je n'ai pas cette info").
- Reste concise et concrète. Pas de listes interminables — va à l'essentiel, propose les 3-5 profils les plus pertinents.
- Tu tutoies l'utilisateur, ton chaleureux et efficace.
- Réponds en texte simple (pas de JSON, pas de markdown lourd — des tirets pour lister, c'est tout).`

export async function POST(req: NextRequest) {
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })
  const gate = await requireActiveAccess()
  if (!gate.ok) return gate.response

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

  const quota = await consumeQuota(getAdminSupabase(), user.id, "assistant")
  if (!quota.ok) {
    return NextResponse.json({ error: "quota_exceeded", message: quota.message }, { status: 429 })
  }
  const orgLlm = await consumeOrgLlmActionForUser(getAdminSupabase(), user.id)
  if (!orgLlm.ok) {
    return NextResponse.json({ error: orgLlm.code ?? "llm_quota_exceeded", message: orgLlm.message }, { status: 429 })
  }

  // Compact snapshot of the user's data (RLS-scoped reads).
  const { data: candRows } = await sb
    .from("candidates")
    .select("id, full_name, current_title, current_company, years_experience, seniority_level, location, skills, taxonomy, parse_status")
    .eq("parse_status", "parsed")
    .order("created_at", { ascending: false })
    .limit(MAX_CANDIDATES)

  const { data: jobRows } = await sb
    .from("jobs")
    .select("id, title, seniority, location, status, required_skills")
    .order("created_at", { ascending: false })
    .limit(MAX_JOBS)

  const candidates = (candRows ?? []).map((c) => ({
    name: c.full_name ?? "Sans nom",
    title: c.current_title,
    company: c.current_company,
    years: c.years_experience,
    seniority: c.seniority_level ?? c.taxonomy?.seniority ?? null,
    location: c.location,
    role_family: c.taxonomy?.role_family ?? [],
    skills: (c.taxonomy?.core_skills ?? c.skills ?? []).slice(0, 12),
    tools: c.taxonomy?.tools ?? [],
    domains: c.taxonomy?.domains ?? [],
  }))
  const jobs = (jobRows ?? []).map((j) => ({
    title: j.title,
    seniority: j.seniority,
    location: j.location,
    status: j.status,
    required_skills: j.required_skills ?? [],
  }))

  const context = `CONTEXTE — vivier (${candidates.length} candidats parsés) et missions (${jobs.length}) :\n`
    + `CANDIDATS :\n${JSON.stringify(candidates)}\n\n`
    + `MISSIONS :\n${JSON.stringify(jobs)}`

  let result
  try {
    result = await openrouterChat({
      model: "openai/gpt-4o-mini",
      temperature: 0.3,
      maxTokens: 800,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "system", content: context },
        ...history.slice(-MAX_TURNS),
      ],
    })
  } catch (err) {
    return NextResponse.json(
      { error: "llm_failed", detail: (err as Error).message },
      { status: 502 },
    )
  }

  const reply = result.content.trim() || "Désolée, je n'ai pas pu répondre. Reformule ?"
  return NextResponse.json({ reply, vivier_size: candidates.length })
}
