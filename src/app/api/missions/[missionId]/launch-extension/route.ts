/**
 * POST /api/missions/[missionId]/launch-extension
 *
 * The "launch" entry-point called from the workspace chat when the user
 * confirms "lancer la recherche". Implements the full search flow
 * server-side using the Google Custom Search JSON API (no scraping, no
 * CAPTCHA risk):
 *
 *   1. Generate Google search queries from the brief.
 *   2. Run each query via Custom Search API.
 *   3. Score the resulting LinkedIn profiles via OpenRouter.
 *   4. Insert candidates and:
 *        - Léo : mark mission completed, build the Excel, return done.
 *        - Nora: keep mission in_progress and return raw URLs to the
 *                extension so it can enrich them on LinkedIn (where the
 *                user is logged in) before final scoring.
 *
 * Auth: cookie SSR (called from the workspace web app).
 */

import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import type { Database, MissionBrief } from "@/lib/database.types"
import { generateQueriesFromBrief } from "@/lib/extension-queries"
import { searchLinkedInForBrief } from "@/lib/google-cse"
import {
  scoreProfiles,
  buildExcel,
  type RawProfile,
} from "@/lib/profile-pipeline"

const MAX_PROFILES_PER_RUN = 30 // soft cap, fits in one OpenRouter scoring call

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
          } catch { /* edge runtime */ }
        },
      },
    }
  )

  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Load mission + verify ownership
  const { data: mission } = await sb
    .from("missions")
    .select("id, title, brief, agent_level, status, user_id")
    .eq("id", missionId)
    .eq("user_id", user.id)
    .single()

  if (!mission) {
    return NextResponse.json({ error: "Mission introuvable" }, { status: 404 })
  }
  if (!mission.brief?.titre_poste) {
    return NextResponse.json({ error: "Brief incomplet — précisez le poste" }, { status: 400 })
  }
  if (mission.status === "in_progress") {
    return NextResponse.json({ error: "Recherche déjà en cours" }, { status: 409 })
  }

  // Quota check
  const { data: profileRow } = await sb
    .from("profiles")
    .select("apify_credits_used, apify_reset_at")
    .eq("user_id", user.id)
    .single()

  if (profileRow) {
    const now = new Date()
    const resetAt = profileRow.apify_reset_at ? new Date(profileRow.apify_reset_at) : new Date(0)
    const sameMonth = now.getFullYear() === resetAt.getFullYear() && now.getMonth() === resetAt.getMonth()
    const used = sameMonth ? (profileRow.apify_credits_used ?? 0) : 0
    if (used >= 1000) {
      return NextResponse.json(
        { error: "Quota mensuel atteint (1 000 profils)." },
        { status: 429 }
      )
    }
  }

  const level = (mission.agent_level === "nora" ? "nora" : "leo") as "leo" | "nora"
  const brief = mission.brief as MissionBrief

  // 1. Generate Google queries from the structured brief
  const queries = await generateQueriesFromBrief(brief, level)
  if (queries.length === 0) {
    return NextResponse.json({ error: "Aucune requête générée" }, { status: 500 })
  }

  // Mark mission running
  await sb
    .from("missions")
    .update({
      status: "in_progress",
      brief: { ...brief, __source: "extension_chat", __user_id: user.id, __mission_id: missionId },
    })
    .eq("id", missionId)

  // 2. Run Google Custom Search API for each query (server-side, no scraping)
  let foundProfiles: RawProfile[] = []
  try {
    foundProfiles = await searchLinkedInForBrief(queries)
  } catch (e) {
    console.error("[launch-extension] CSE error:", e)
  }

  // Cap at MAX_PROFILES_PER_RUN
  foundProfiles = foundProfiles.slice(0, MAX_PROFILES_PER_RUN)

  // ── Léo : score immediately + insert candidates + complete the mission ───
  if (level === "leo") {
    if (foundProfiles.length === 0) {
      const reason = "Aucun profil trouvé. Active l'API Google Custom Search (1 clic) : https://console.cloud.google.com/apis/library/customsearch.googleapis.com — ou affine les mots-clés."
      await sb
        .from("missions")
        .update({
          status: "error",
          brief:  { ...brief, __error: reason },
        })
        .eq("id", missionId)
      return NextResponse.json(
        { ok: false, error: reason },
        { status: 200 }
      )
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
      console.warn("[launch-extension] scoring failed, using neutral score:", e)
    }

    // Dedupe against existing candidates
    const { data: existing } = await sb
      .from("candidates")
      .select("linkedin_url")
      .eq("mission_id", missionId)
    const existingUrls = new Set((existing ?? []).map((r) => r.linkedin_url))

    const fresh = scored.filter((p) => !existingUrls.has(p.linkedin_url))
    if (fresh.length > 0) {
      const rows = fresh.map((p) => ({
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
        source:              "linkedin" as const,
        status:              "raw" as const,
      }))
      const { error: insErr } = await sb.from("candidates").insert(rows)
      if (insErr) console.error("[launch-extension] insert error:", insErr)
    }

    // Build Excel + finalize
    let excelB64 = ""
    try {
      excelB64 = buildExcel(scored, brief)
    } catch (e) {
      console.warn("[launch-extension] excel build failed:", e)
    }

    await sb
      .from("missions")
      .update({
        status:           "completed",
        profiles_count:   scored.length,
        brief: { ...brief, __excel_b64: excelB64, __completed_at: new Date().toISOString() },
      })
      .eq("id", missionId)

    // Increment quota
    if (profileRow) {
      await sb
        .from("profiles")
        .update({
          apify_credits_used: (profileRow.apify_credits_used ?? 0) + scored.length,
          apify_reset_at:     profileRow.apify_reset_at ?? new Date().toISOString(),
        })
        .eq("user_id", user.id)
    }

    return NextResponse.json({
      ok:           true,
      missionId,
      level:        "leo",
      done:         true,
      profilesCount: scored.length,
      title:        mission.title,
      brief: {
        titre_poste:  brief.titre_poste,
        localisation: brief.localisation,
        criteres:     brief.criteres ?? "",
        mots_cles:    brief.mots_cles ?? [],
      },
      // queries kept for diagnostics; the extension is no longer needed for Léo
      queries:      [],
    })
  }

  // ── Nora : pass the URLs to the extension for LinkedIn enrichment ────────
  return NextResponse.json({
    ok:    true,
    missionId,
    level: "nora",
    done:  false,
    title: mission.title,
    brief: {
      titre_poste:  brief.titre_poste,
      localisation: brief.localisation,
      criteres:     brief.criteres ?? "",
      mots_cles:    brief.mots_cles ?? [],
    },
    profiles: foundProfiles, // raw profiles to be enriched by the extension
    queries:  [],            // extension no longer scrapes Google
  })
}
