/**
 * Shared scoring + Excel pipeline for profiles fetched by the extension.
 * Used by /api/missions/[id]/profiles and /api/extension/analyze-profiles.
 */

import * as XLSX from "xlsx"
import type { ScoreDimensions } from "@/lib/database.types"

export interface RawProfile {
  linkedin_url: string
  name:         string
  title:        string
  company:      string
  location:     string
  snippet:      string
}

export interface ScoredProfile extends RawProfile {
  relevance_score:     number
  score_justification: string
  score_dimensions?:   ScoreDimensions
  seniority_level:     string
}

export interface ScoringBrief {
  titre_poste:  string
  localisation: string
  criteres?:    string
  mots_cles?:   string[]
}

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

// Max profiles per OpenRouter scoring call (output ≈ 60 tokens × N → cap to
// keep us under max_tokens). Beyond 30 we chunk into multiple parallel calls.
const SCORING_BATCH_SIZE = 30

export async function scoreProfiles(
  brief: ScoringBrief,
  profiles: RawProfile[]
): Promise<ScoredProfile[]> {
  const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY
  if (!OPENROUTER_KEY || profiles.length === 0) {
    return profiles.map(p => ({
      ...p,
      relevance_score: 50,
      score_justification: "",
      seniority_level: "",
    }))
  }

  // Chunk profiles into batches of SCORING_BATCH_SIZE and score in parallel
  const chunks: RawProfile[][] = []
  for (let i = 0; i < profiles.length; i += SCORING_BATCH_SIZE) {
    chunks.push(profiles.slice(i, i + SCORING_BATCH_SIZE))
  }

  const scoredChunks = await Promise.all(chunks.map((c) => scoreChunk(brief, c, OPENROUTER_KEY)))
  return scoredChunks.flat().sort((a, b) => (b.relevance_score ?? 0) - (a.relevance_score ?? 0))
}

async function scoreChunk(
  brief: ScoringBrief,
  batch: RawProfile[],
  OPENROUTER_KEY: string
): Promise<ScoredProfile[]> {
  const profilesForLLM = batch.map((p, i) => ({
    index:      i,
    titre:      (p.title || "").slice(0, 80),
    entreprise: (p.company || "").slice(0, 60),
    lieu:       (p.location || "").slice(0, 40),
    resume:     (p.snippet || "").slice(0, 200),
  }))

  const prompt =
    `Expert recruteur, évalue ces profils LinkedIn pour : « ${brief.titre_poste} » à ${brief.localisation}.\n` +
    `Critères : ${brief.criteres || "Non précisés"}\n` +
    `Mots-clés : ${(brief.mots_cles || []).join(", ") || "—"}\n\n` +
    `Pour chaque profil, retourne UNIQUEMENT ce JSON array :\n` +
    `[{"index":0,"score":85,"competences":90,"seniorite":80,"localisation":100,"qualite":75,` +
    `"seniority":"Senior","justification":"Points forts clés en 1 phrase"},...]\n\n` +
    `Définitions :\n` +
    `- score : pertinence globale 0-100\n` +
    `- competences : % compétences requises 0-100\n` +
    `- seniorite : niveau d'expérience vs critères 0-100\n` +
    `- localisation : 100 si dans ${brief.localisation} ou région proche (max 50 km),\n` +
    `   60 si même pays mais autre région,\n` +
    `   0-30 si autre pays. C'est un critère ÉLIMINATOIRE : le score global ` +
    `   doit être ≤ 35 si la localisation est < 50 (mauvais pays / autre région éloignée).\n` +
    `- qualite : complétude du profil 0-100\n` +
    `- seniority : Junior | Confirmé | Senior | Expert\n` +
    `- justification : 1 phrase max\n\n` +
    `Si le profil est clairement hors localisation (ex: "Munich, Germany" alors que le brief demande "Paris"), ` +
    `tu dois lui donner un score global < 35 même si toutes les autres dimensions sont parfaites.\n\n` +
    `Profils :\n` + JSON.stringify(profilesForLLM, null, 0)

  const scored = batch.map(p => ({ ...p, relevance_score: 50, score_justification: "", seniority_level: "" })) as ScoredProfile[]

  try {
    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENROUTER_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
        max_tokens: 2000,
      }),
    })

    if (res.ok) {
      const json = (await res.json()) as { choices: { message: { content: string } }[] }
      const content = json.choices[0]?.message?.content ?? ""
      const match = content.match(/\[[\s\S]*\]/)
      if (match) {
        const parsed = JSON.parse(match[0]) as Array<{
          index: number; score: number; competences: number; seniorite: number;
          localisation: number; qualite: number; seniority: string; justification: string
        }>
        for (const s of parsed) {
          const i = s.index
          if (i < 0 || i >= scored.length) continue
          scored[i].relevance_score = s.score
          scored[i].score_justification = s.justification
          scored[i].seniority_level = s.seniority
          scored[i].score_dimensions = {
            competences:  s.competences,
            seniorite:    s.seniorite,
            localisation: s.localisation,
            qualite:      s.qualite,
          }
        }
      }
    }
  } catch (e) {
    console.warn("[profile-pipeline] LLM scoring failed:", (e as Error).message)
  }

  return scored
}

export function buildExcel(profiles: ScoredProfile[], brief: ScoringBrief): string {
  const rows = profiles.map((p, i) => ({
    "Rang":          i + 1,
    "Nom":           p.name || "",
    "Titre":         p.title || "",
    "Entreprise":    p.company || "",
    "Localisation":  p.location || "",
    "Score":         p.relevance_score ?? "",
    "Séniorité":     p.seniority_level || "",
    "Justification": p.score_justification || "",
    "Résumé":        (p.snippet || "").slice(0, 200),
    "LinkedIn":      p.linkedin_url || "",
  }))

  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, `${brief.titre_poste.slice(0, 25)} — Naywa`)

  const cols = Object.keys(rows[0] || {}).map(k => ({ wch: Math.min(Math.max(k.length + 2, 12), 50) }))
  ws["!cols"] = cols

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer
  return Buffer.from(buf).toString("base64")
}

export function dedupeByLinkedinUrl(profiles: RawProfile[]): RawProfile[] {
  const seen = new Set<string>()
  const out: RawProfile[] = []
  for (const p of profiles) {
    if (!p.linkedin_url) continue
    const key = p.linkedin_url.split("?")[0].toLowerCase().replace(/\/$/, "")
    if (seen.has(key)) continue
    seen.add(key)
    out.push(p)
  }
  return out
}
