/**
 * Generates Google search queries from a structured mission brief.
 * Used by /api/missions/[id]/launch-extension to feed the extension worker.
 *
 * Falls back to a deterministic builder when OpenRouter is unavailable.
 */

import type { MissionBrief } from "@/lib/database.types"

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

export async function generateQueriesFromBrief(
  brief: MissionBrief,
  level: "leo" | "nora"
): Promise<string[]> {
  const numQueries = level === "nora" ? 6 : 4

  const fallback = (): string[] => {
    const loc = brief.localisation && brief.localisation !== "France"
      ? ` ${brief.localisation}` : ""
    const kw = (brief.mots_cles ?? []).slice(0, 4)
    const out: string[] = [
      `site:linkedin.com/in "${brief.titre_poste}"${loc}`,
      `site:linkedin.com/in "${brief.titre_poste}"${kw[0] ? ` "${kw[0]}"` : ""}`,
    ]
    if (numQueries >= 4) {
      out.push(`site:linkedin.com/in "${brief.titre_poste}"${kw[1] ? ` "${kw[1]}"` : ""}${loc}`)
      out.push(`site:linkedin.com/in "${brief.titre_poste}" ${kw.slice(0, 2).map(t => `"${t}"`).join(" ")}`)
    }
    if (numQueries >= 6) {
      out.push(`site:linkedin.com/in "${brief.titre_poste}"${kw[2] ? ` "${kw[2]}"` : ""}`)
      out.push(`site:linkedin.com/in "${brief.titre_poste}"${kw[3] ? ` "${kw[3]}"` : ""}${loc}`)
    }
    return out.slice(0, numQueries)
  }

  const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY
  if (!OPENROUTER_KEY) return fallback()

  const prompt =
    `Tu es expert recrutement LinkedIn. À partir de ce brief, génère exactement ${numQueries} requêtes Google distinctes ` +
    `qui maximisent le recouvrement de profils pertinents.\n\n` +
    `Brief :\n` +
    `- Poste : ${brief.titre_poste}\n` +
    `- Localisation : ${brief.localisation}\n` +
    `- Mots-clés : ${(brief.mots_cles ?? []).join(", ") || "—"}\n` +
    `- Critères : ${brief.criteres ?? "—"}\n\n` +
    `Réponds UNIQUEMENT avec ce JSON (rien avant ni après) :\n` +
    `{ "queries": ["site:linkedin.com/in \\"...\\" \\"...\\"", "..."] }\n\n` +
    `Règles impératives :\n` +
    `- Chaque requête commence par "site:linkedin.com/in"\n` +
    `- Termes importants entre guillemets doubles\n` +
    `- Variation des angles : titre exact, synonymes anglais (ex: monétique → "payment"), compétences, secteur\n` +
    `- Inclure "${brief.localisation}" dans environ la moitié des requêtes\n` +
    `- Aucun doublon — chaque requête doit ramener une population distincte\n` +
    `- Exactement ${numQueries} requêtes`

  try {
    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 700,
      }),
    })

    if (!res.ok) throw new Error(`OpenRouter ${res.status}`)
    const json = (await res.json()) as { choices: { message: { content: string } }[] }
    const content = json.choices[0]?.message?.content ?? ""
    const match = content.match(/\{[\s\S]*\}/)
    if (!match) throw new Error("No JSON in LLM response")

    const parsed = JSON.parse(match[0]) as { queries?: string[] }
    if (!Array.isArray(parsed.queries) || parsed.queries.length === 0) {
      throw new Error("Bad LLM response shape")
    }
    return parsed.queries
      .map(q => q.trim())
      .filter(q => q.toLowerCase().startsWith("site:linkedin.com/in"))
      .slice(0, numQueries)
  } catch (e) {
    console.warn("[extension-queries] fallback:", (e as Error).message)
    return fallback()
  }
}
