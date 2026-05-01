/**
 * POST /api/missions/[missionId]/run-server-search
 *
 * Server-side fallback used when the user has no Nawa extension installed.
 * Runs the Google Custom Search API + DuckDuckGo HTML fallback, scores
 * the resulting LinkedIn profiles, inserts candidates, and finalizes the
 * mission as completed.
 *
 * The mission must already be in `in_progress` (set by /launch-extension).
 *
 * Auth: cookie SSR.
 */

import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import type { Database, MissionBrief } from "@/lib/database.types"
import { generateQueriesFromBrief } from "@/lib/extension-queries"
import { searchLinkedInForBrief } from "@/lib/google-cse"
import { scoreProfiles, buildExcel } from "@/lib/profile-pipeline"

const MAX_PROFILES = 80

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ missionId: string }> }
) {
  const { missionId } = await params
  const cookieStore = await cookies()
  const sb = createServerClient<Database>(
    (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim(),
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim(),
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try {
            for (const { name, value, options } of toSet) cookieStore.set(name, value, options)
          } catch { /* ignore */ }
        },
      },
    }
  )

  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: mission } = await sb
    .from("missions")
    .select("id, brief, agent_level, status, user_id")
    .eq("id", missionId)
    .eq("user_id", user.id)
    .single()
  if (!mission) return NextResponse.json({ error: "Mission introuvable" }, { status: 404 })
  if (!mission.brief?.titre_poste) {
    return NextResponse.json({ error: "Brief incomplet" }, { status: 400 })
  }

  const brief = mission.brief as MissionBrief
  const level = (mission.agent_level === "nora" ? "nora" : "leo") as "leo" | "nora"

  const queries = await generateQueriesFromBrief(brief, level)
  let foundProfiles = await searchLinkedInForBrief(queries)
  foundProfiles = foundProfiles.slice(0, MAX_PROFILES)

  if (foundProfiles.length === 0) {
    const reason = "Aucun profil trouvé. Active l'API Google Custom Search (1 clic) : https://console.cloud.google.com/apis/library/customsearch.googleapis.com — ou installe l'extension Nawa Studio."
    await sb
      .from("missions")
      .update({ status: "error", brief: { ...brief, __error: reason } })
      .eq("id", missionId)
    return NextResponse.json({ ok: false, error: reason }, { status: 200 })
  }

  let scored: import("@/lib/profile-pipeline").ScoredProfile[] = foundProfiles.map((p) => ({
    ...p,
    relevance_score:     50,
    score_justification: "",
    seniority_level:     "",
  }))
  try {
    scored = await scoreProfiles(brief, foundProfiles)
  } catch (e) {
    console.warn("[run-server-search] scoring failed, using neutral score:", e)
  }

  // Dedupe against existing
  const { data: existing } = await sb
    .from("candidates")
    .select("linkedin_url")
    .eq("mission_id", missionId)
  const existingUrls = new Set((existing ?? []).map((r) => r.linkedin_url))
  const fresh = scored.filter((p) => !existingUrls.has(p.linkedin_url))

  if (fresh.length > 0) {
    const rows = fresh.map((p) => {
      const source: "linkedin" | "malt" =
        p.linkedin_url.includes("malt.fr") || p.linkedin_url.includes("malt.com") ? "malt" : "linkedin"
      return {
        mission_id:          missionId,
        user_id:             user.id,
        linkedin_url:        p.linkedin_url,
        name_estimated:      p.name || null,
        title_estimated:     p.title || null,
        company:             p.company || null,
        keywords:            [] as string[],
        relevance_score:     p.relevance_score ?? null,
        score_justification: p.score_justification || null,
        score_dimensions:    p.score_dimensions ?? null,
        seniority_level:     p.seniority_level || null,
        source,
        status:              "raw" as const,
      }
    })
    const { error: insErr } = await sb.from("candidates").insert(rows)
    if (insErr) console.error("[run-server-search] insert error:", insErr)
  }

  let excelB64 = ""
  try { excelB64 = buildExcel(scored, brief) } catch (e) {
    console.warn("[run-server-search] excel build failed:", e)
  }

  await sb
    .from("missions")
    .update({
      status:         "completed",
      profiles_count: scored.length,
      brief:          { ...brief, __excel_b64: excelB64, __completed_at: new Date().toISOString() },
    })
    .eq("id", missionId)

  return NextResponse.json({
    ok:            true,
    missionId,
    profilesCount: scored.length,
  })
}
