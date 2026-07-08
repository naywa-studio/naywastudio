/**
 * POST /api/sectors/define  body: { name }
 *
 * Nora écrit une DÉFINITION courte pour un secteur que le sourceur veut créer,
 * et signale un éventuel DOUBLON avec un secteur existant (anti-fragmentation
 * de la taxonomie). N'écrit rien : la création se fait via POST /api/sectors
 * une fois la définition validée.
 *
 * Retour : { description, duplicate_of?: string }
 */

import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { getAdminSupabase } from "@/lib/admin-supabase"
import { consumeOrgLlmActionForUser } from "@/lib/quota"
import { openrouterChat, safeJsonParse } from "@/lib/openrouter"

export const runtime = "nodejs"
export const maxDuration = 20

const SYSTEM_PROMPT = `Tu aides un cabinet de recrutement à définir un SECTEUR (domaine métier) pour ranger ses candidats.

À partir d'un NOM de secteur proposé et de la liste des secteurs existants, tu :
1. Écris une DÉFINITION courte (1 phrase, ≤ 160 caractères) : "Regroupe les profils qui…" — claire, orientée profils/métiers.
2. Repères un éventuel DOUBLON : si le nom recouvre clairement un secteur existant (même domaine), renvoie son nom exact dans "duplicate_of". Sinon "duplicate_of": null.

RÉPONDS UNIQUEMENT EN JSON : { "description": "...", "duplicate_of": "Nom exact" | null }`

export async function POST(req: NextRequest) {
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })

  const body = await req.json().catch(() => null) as { name?: unknown } | null
  const name = typeof body?.name === "string" ? body.name.trim() : ""
  if (!name || name.length > 60) {
    return NextResponse.json({ error: "invalid_name" }, { status: 400 })
  }

  const { data: sectorRows } = await sb.from("sectors").select("name").order("name")
  const existing = (sectorRows ?? []).map((s) => s.name)

  const orgLlm = await consumeOrgLlmActionForUser(getAdminSupabase(), user.id)
  if (!orgLlm.ok) {
    return NextResponse.json(
      { error: orgLlm.code ?? "llm_quota_exceeded", message: orgLlm.message },
      { status: 429 },
    )
  }

  let raw
  try {
    raw = await openrouterChat({
      model: "openai/gpt-4o-mini",
      temperature: 0.2,
      responseFormat: "json_object",
      maxTokens: 160,
      timeoutMs: 15_000,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `SECTEUR PROPOSÉ : ${name}\n\nSECTEURS EXISTANTS : ${existing.length ? existing.join(", ") : "(aucun)"}` },
      ],
    })
  } catch (err) {
    return NextResponse.json({ error: "llm_failed", detail: (err as Error).message }, { status: 502 })
  }

  const parsed = safeJsonParse<{ description?: unknown; duplicate_of?: unknown }>(raw.content)
  const description = typeof parsed?.description === "string" ? parsed.description.trim().slice(0, 200) : ""
  // duplicate_of doit correspondre à un secteur existant réel.
  const dup = typeof parsed?.duplicate_of === "string" ? parsed.duplicate_of.trim() : ""
  const duplicateOf = existing.find((n) => n.toLowerCase() === dup.toLowerCase()) ?? null

  return NextResponse.json({ ok: true, description, duplicate_of: duplicateOf })
}
