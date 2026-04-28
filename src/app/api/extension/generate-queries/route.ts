/**
 * POST /api/extension/generate-queries
 * Reçoit un texte libre décrivant le poste recherché.
 * Utilise le même LLM que le chat central pour :
 *  1. Parser le brief structuré (titre, localisation, critères, mots-clés)
 *  2. Générer des requêtes Google optimisées pour trouver des profils LinkedIn
 *
 * Auth: Bearer <access_token>
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient }              from "@supabase/supabase-js"
import type { Database, MissionBrief } from "@/lib/database.types"

const sbAdmin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function getUserFromBearer(req: NextRequest) {
  const auth  = req.headers.get("authorization") ?? ""
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : ""
  if (!token) return null
  const { data: { user }, error } = await sbAdmin.auth.getUser(token)
  if (error || !user) return null
  return user
}

function buildFallbackResponse(raw_text: string, numQueries: number): {
  brief: MissionBrief; queries: string[]
} {
  return {
    brief: {
      titre_poste:  raw_text.trim().slice(0, 60),
      localisation: "France",
      criteres:     "",
      mots_cles:    [],
    },
    queries: Array.from({ length: Math.min(numQueries, 2) }, (_, i) =>
      i === 0
        ? `site:linkedin.com/in "${raw_text.trim()}" France`
        : `site:linkedin.com/in "${raw_text.trim()}"`
    ),
  }
}

export async function POST(req: NextRequest) {
  const user = await getUserFromBearer(req)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: { raw_text: string; level?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const { raw_text, level = "leo" } = body
  if (!raw_text?.trim()) {
    return NextResponse.json({ error: "raw_text requis" }, { status: 400 })
  }

  const numQueries = level === "nora" ? 6 : 4
  const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY

  if (!OPENROUTER_KEY) {
    console.warn("[generate-queries] No OPENROUTER_API_KEY — using fallback")
    return NextResponse.json({ ok: true, ...buildFallbackResponse(raw_text, numQueries) })
  }

  const prompt =
    `Tu es un expert en recrutement. À partir d'une description libre de poste, extrais un brief structuré ` +
    `et génère des requêtes Google optimisées pour trouver des profils LinkedIn.\n\n` +
    `Description : "${raw_text.trim()}"\n` +
    `Niveau agent : ${level} → génère exactement ${numQueries} requêtes\n\n` +
    `Réponds UNIQUEMENT avec ce JSON (aucun texte avant ou après) :\n` +
    `{\n` +
    `  "brief": {\n` +
    `    "titre_poste": "2-4 mots (ex: Business Analyst Senior)",\n` +
    `    "localisation": "ville ou France",\n` +
    `    "criteres": "séniorité, secteur, expérience clés en 1 phrase",\n` +
    `    "mots_cles": ["4 à 8 mots-clés sectoriels pertinents"]\n` +
    `  },\n` +
    `  "queries": [\n` +
    `    "site:linkedin.com/in \\"terme1\\" \\"terme2\\" localisation",\n` +
    `    "..."\n` +
    `  ]\n` +
    `}\n\n` +
    `Règles impératives pour les requêtes :\n` +
    `- Commencer TOUJOURS par site:linkedin.com/in\n` +
    `- Mettre les termes importants entre guillemets doubles\n` +
    `- Varier les angles : titre exact, synonymes, secteur/industrie, compétences techniques\n` +
    `- Inclure la localisation dans la moitié des requêtes\n` +
    `- Pas de doublons — chaque requête doit apporter une nouvelle population\n` +
    `- Générer exactement ${numQueries} requêtes`

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method:  "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_KEY}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({
        model:       "openai/gpt-4o-mini",
        messages:    [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens:  900,
      }),
    })

    if (!res.ok) throw new Error(`OpenRouter ${res.status}`)

    const json    = await res.json() as { choices: { message: { content: string } }[] }
    const content = json.choices[0]?.message?.content ?? ""
    const match   = content.match(/\{[\s\S]*\}/)
    if (!match) throw new Error("No JSON found in LLM response")

    const parsed = JSON.parse(match[0]) as { brief: MissionBrief; queries: string[] }

    if (!parsed.brief?.titre_poste || !Array.isArray(parsed.queries) || parsed.queries.length === 0) {
      throw new Error("Invalid LLM response structure")
    }

    console.log(
      `[generate-queries] User ${user.id}: ${parsed.queries.length} queries ` +
      `for "${parsed.brief.titre_poste}" / ${parsed.brief.localisation}`
    )

    return NextResponse.json({ ok: true, brief: parsed.brief, queries: parsed.queries })
  } catch (e) {
    console.error("[generate-queries] LLM error:", e)
    return NextResponse.json({ ok: true, ...buildFallbackResponse(raw_text, numQueries) })
  }
}
