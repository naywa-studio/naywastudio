/**
 * POST /api/extension/analyze-profiles
 * Reçoit une liste de profils LinkedIn capturés par la side panel
 * (depuis une page de recherche LinkedIn que l'utilisateur a parcourue).
 *
 * Flux :
 *  1. Auth Bearer token (extension)
 *  2. Valider le brief + les profils
 *  3. LLM scoring via OpenRouter (gpt-4o-mini)
 *  4. Sauvegarder mission + candidates dans Supabase
 *  5. Générer un Excel (xlsx)
 *  6. Retourner { ok, mission_id, excel_b64, candidates_count, top_profiles }
 *
 * Auth: Bearer <access_token> (token Supabase de l'utilisateur)
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient }              from "@supabase/supabase-js"
import * as XLSX                     from "xlsx"
import type { Database }             from "@/lib/database.types"

const sbAdmin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ── Types ─────────────────────────────────────────────────────────────────────

interface InputProfile {
  linkedin_url: string
  name:         string
  title:        string
  company:      string
  location:     string
  snippet:      string
  source?:      string
}

interface Brief {
  titre_poste:  string
  localisation: string
  criteres:     string
  mots_cles:    string[]
}

interface ScoredProfile extends InputProfile {
  relevance_score:     number
  score_justification: string
  score_dimensions?:   { competences: number; seniorite: number; localisation: number; qualite: number }
  seniority_level:     string
}

// ── Auth ──────────────────────────────────────────────────────────────────────

async function getUserFromBearer(req: NextRequest) {
  const auth  = req.headers.get("authorization") ?? ""
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : ""
  if (!token) return null
  const { data: { user }, error } = await sbAdmin.auth.getUser(token)
  if (error || !user) return null
  return user
}

// ── LLM Scoring ───────────────────────────────────────────────────────────────

async function scoreProfiles(brief: Brief, profiles: InputProfile[]): Promise<ScoredProfile[]> {
  const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY
  if (!OPENROUTER_KEY || profiles.length === 0) {
    return profiles.map(p => ({
      ...p,
      relevance_score:     50,
      score_justification: "",
      seniority_level:     "",
    }))
  }

  const batch = profiles.slice(0, 30)

  const profilesForLLM = batch.map((p, i) => ({
    index:      i,
    titre:      p.title.slice(0, 80),
    entreprise: p.company.slice(0, 60),
    lieu:       p.location.slice(0, 40),
    resume:     p.snippet.slice(0, 200),
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
    `- competences : % compétences requises estimées 0-100\n` +
    `- seniorite : niveau d'expérience vs critères 0-100\n` +
    `- localisation : correspondance géographique 0-100\n` +
    `- qualite : complétude du profil 0-100\n` +
    `- seniority : Junior | Confirmé | Senior | Expert\n` +
    `- justification : 1 phrase max\n\n` +
    `Note : données extraites depuis LinkedIn Search — basez-vous sur titre et résumé disponibles.\n\n` +
    `Profils :\n` + JSON.stringify(profilesForLLM, null, 0)

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
        temperature: 0.1,
        max_tokens:  2000,
      }),
    })

    if (!res.ok) throw new Error(`OpenRouter ${res.status}`)
    const json    = await res.json() as { choices: { message: { content: string } }[] }
    const content = json.choices[0]?.message?.content ?? ""
    const match   = content.match(/\[[\s\S]*\]/)

    if (match) {
      const scores = JSON.parse(match[0]) as {
        index: number; score: number; competences: number; seniorite: number;
        localisation: number; qualite: number; seniority: string; justification: string
      }[]

      scores.forEach(s => {
        const i = s.index
        if (i < 0 || i >= batch.length) return
        const p = batch[i] as ScoredProfile
        p.relevance_score     = s.score
        p.score_justification = s.justification
        p.seniority_level     = s.seniority
        p.score_dimensions    = {
          competences:  s.competences,
          seniorite:    s.seniorite,
          localisation: s.localisation,
          qualite:      s.qualite,
        }
      })
      console.log(`[analyze-profiles] Scored ${scores.length} profiles`)
    }
  } catch (e) {
    console.warn("[analyze-profiles] LLM scoring failed:", e)
  }

  // Profils sans score → défaut 50
  batch.forEach(p => {
    const sp = p as ScoredProfile
    if (sp.relevance_score == null) sp.relevance_score = 50
  })

  const rest = profiles.slice(30).map(p => ({
    ...p, relevance_score: 50, score_justification: "", seniority_level: "",
  })) as ScoredProfile[]

  return [...(batch as ScoredProfile[]), ...rest]
    .sort((a, b) => (b.relevance_score ?? 0) - (a.relevance_score ?? 0))
}

// ── Excel ─────────────────────────────────────────────────────────────────────

function buildExcel(profiles: ScoredProfile[], brief: Brief): string {
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
  XLSX.utils.book_append_sheet(wb, ws, `${brief.titre_poste.slice(0, 25)} — Nawa`)

  // Largeur colonnes auto
  const cols = Object.keys(rows[0] || {}).map(k => ({ wch: Math.min(Math.max(k.length + 2, 12), 50) }))
  ws["!cols"] = cols

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer
  return Buffer.from(buf).toString("base64")
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const user = await getUserFromBearer(req)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: { brief: Brief; profiles: InputProfile[] }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const { brief, profiles } = body

  if (!brief?.titre_poste || !Array.isArray(profiles) || profiles.length === 0) {
    return NextResponse.json({ error: "brief.titre_poste et profiles[] requis" }, { status: 400 })
  }

  // Dédupliquer les profils par URL
  const seen: Set<string> = new Set()
  const dedupedProfiles = profiles.filter(p => {
    if (!p.linkedin_url) return false
    const key = p.linkedin_url.split("?")[0].toLowerCase().replace(/\/$/, "")
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  console.log(`[analyze-profiles] User ${user.id}: ${dedupedProfiles.length} profils — ${brief.titre_poste} / ${brief.localisation}`)

  // ── Score via LLM ────────────────────────────────────────────────────────────
  const scored = await scoreProfiles(brief, dedupedProfiles)

  // ── Créer la mission dans Supabase ───────────────────────────────────────────
  const { data: mission, error: mErr } = await sbAdmin
    .from("missions")
    .insert({
      user_id:       user.id,
      title:         `${brief.titre_poste} — ${brief.localisation}`,
      agent_level:   "leo",
      status:        "completed",
      profiles_count: scored.length,
      brief: {
        titre_poste:  brief.titre_poste,
        localisation: brief.localisation,
        criteres:     brief.criteres || "",
        mots_cles:    brief.mots_cles || [],
        __source:     "extension_linkedin",
        __user_id:    user.id,
      },
    })
    .select("id")
    .single()

  if (mErr || !mission) {
    console.error("[analyze-profiles] Mission insert error:", mErr)
    return NextResponse.json({ error: "Erreur création mission" }, { status: 500 })
  }

  const missionId = mission.id

  // ── Sauvegarder les candidates ───────────────────────────────────────────────
  const candidateRows = scored.map(p => ({
    mission_id:          missionId,
    user_id:             user.id,
    linkedin_url:        p.linkedin_url,
    name_estimated:      p.name  || null,
    title_estimated:     p.title || null,
    company:             p.company || null,
    keywords:            [] as string[],
    relevance_score:     p.relevance_score ?? null,
    score_justification: p.score_justification || null,
    score_dimensions:    p.score_dimensions ?? null,
    seniority_level:     p.seniority_level || null,
    source:              "linkedin" as const,
    status:              "raw" as const,
  }))

  if (candidateRows.length > 0) {
    const { error: cErr } = await sbAdmin.from("candidates").insert(candidateRows)
    if (cErr) console.error("[analyze-profiles] Candidates insert error:", cErr)
  }

  // ── Générer l'Excel ──────────────────────────────────────────────────────────
  const excelB64 = buildExcel(scored, brief)

  // ── Stocker l'Excel dans le brief (pour le download ultérieur) ───────────────
  await sbAdmin
    .from("missions")
    .update({ brief: { ...((mission as unknown as { brief: object }).brief || {}), __excel_b64: excelB64 } })
    .eq("id", missionId)

  // Top profils pour la side panel (max 10)
  const topProfiles = scored.slice(0, 10).map(p => ({
    linkedin_url:        p.linkedin_url,
    name_estimated:      p.name,
    title_estimated:     p.title,
    company:             p.company,
    location:            p.location,
    relevance_score:     p.relevance_score,
    score_justification: p.score_justification,
    seniority_level:     p.seniority_level,
  }))

  return NextResponse.json({
    ok:               true,
    mission_id:       missionId,
    excel_b64:        excelB64,
    candidates_count: scored.length,
    top_profiles:     topProfiles,
  })
}
