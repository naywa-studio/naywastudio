/**
 * Generates Google search queries from a structured mission brief.
 *
 * The query mix is biased to LinkedIn (the bulk of recruitment profiles)
 * with a small Malt presence to surface freelance candidates as well.
 *
 * Falls back to a deterministic builder when OpenRouter is unavailable.
 */

import type { MissionBrief } from "@/lib/database.types"

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

// Total number of Google queries fired per mission.
// Léo : 6 LinkedIn + 1 Malt = 7 queries (≈70 raw, deduped to ≤60).
// Nora : 6 LinkedIn + 1 Malt = 7 queries (each result is then enriched on LinkedIn).
const QUERY_COUNTS = {
  leo:  { linkedin: 6, malt: 1 },
  nora: { linkedin: 6, malt: 1 },
} as const

export async function generateQueriesFromBrief(
  brief: MissionBrief,
  level: "leo" | "nora"
): Promise<string[]> {
  const counts = QUERY_COUNTS[level]
  const total  = counts.linkedin + counts.malt

  // Location is non-negotiable — every query carries it. Otherwise Google
  // returns matches from anywhere in the world.
  const rawLoc = (brief.localisation || "").trim()
  const isWorld = !rawLoc || /^france$/i.test(rawLoc) || /^world|monde$/i.test(rawLoc)
  const locTokens = isWorld ? [`"France"`] : [`"${rawLoc}"`]

  const fallback = (): string[] => {
    const loc = locTokens.join(" ")
    const kw = (brief.mots_cles ?? []).slice(0, 6)

    const withLoc = (extra: string) =>
      `site:linkedin.com/in "${brief.titre_poste}" ${extra} ${loc}`.trim().replace(/\s+/g, " ")

    const linkedin: string[] = [
      withLoc(""),
      withLoc(kw[0] ? `"${kw[0]}"` : ""),
      withLoc(kw[1] ? `"${kw[1]}"` : ""),
      withLoc(kw.slice(0, 2).map(t => `"${t}"`).join(" ")),
      withLoc(kw[2] ? `"${kw[2]}"` : ""),
      withLoc(kw[3] ? `"${kw[3]}"` : ""),
      withLoc(kw[4] ? `"${kw[4]}"` : ""),
      withLoc(kw[5] ? `"${kw[5]}"` : ""),
    ].slice(0, counts.linkedin)

    const malt: string[] = [
      `site:malt.fr OR site:malt.com "${brief.titre_poste}" ${loc}`.trim(),
      `site:malt.fr "${brief.titre_poste}" ${loc} ${kw[0] ? `"${kw[0]}"` : ""}`.trim(),
    ].slice(0, counts.malt)

    return [...linkedin, ...malt]
  }

  const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY
  if (!OPENROUTER_KEY) return fallback()

  const prompt =
    `Tu es expert sourcing recrutement. À partir de ce brief, génère exactement ${total} requêtes Google distinctes ` +
    `qui maximisent le recouvrement de profils pertinents.\n\n` +
    `Brief :\n` +
    `- Poste : ${brief.titre_poste}\n` +
    `- Localisation : ${brief.localisation}\n` +
    `- Mots-clés : ${(brief.mots_cles ?? []).join(", ") || "—"}\n` +
    `- Critères : ${brief.criteres ?? "—"}\n\n` +
    `Réponds UNIQUEMENT avec ce JSON (rien avant ni après) :\n` +
    `{ "queries": ["site:linkedin.com/in \\"...\\" \\"...\\"", "..."] }\n\n` +
    `Règles impératives :\n` +
    `- ${counts.linkedin} requêtes commencent par "site:linkedin.com/in"\n` +
    `- ${counts.malt} requêtes commencent par "site:malt.fr OR site:malt.com" (profils freelance)\n` +
    `- Termes importants entre guillemets doubles\n` +
    `- Variation des angles : titre exact, synonymes anglais (ex: monétique → "payment"), compétences, secteur, séniorité\n` +
    `- TOUTES les requêtes DOIVENT inclure "${brief.localisation}" entre guillemets — sinon Google retourne des candidats du monde entier (non négociable)\n` +
    `- Aucun doublon — chaque requête doit ramener une population distincte\n` +
    `- Exactement ${total} requêtes au total`

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
        max_tokens: 900,
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
    const cleaned = parsed.queries
      .map(q => q.trim())
      .filter(q => /^site:(linkedin\.com\/in|malt\.fr|malt\.com)/i.test(q))
      .slice(0, total)
    if (cleaned.length === 0) throw new Error("No valid queries from LLM")
    return cleaned
  } catch (e) {
    console.warn("[extension-queries] fallback:", (e as Error).message)
    return fallback()
  }
}
