/**
 * POST /api/missions/[missionId]/lookalike
 * Body: { seedCandidateId: string }
 *
 * Finds candidates similar to a seed profile already in the mission.
 * Generates targeted Google queries from the seed's title + company +
 * keywords, runs the search server-side (CSE → Tavily → DDG → Bing),
 * scores against the mission brief, and inserts up to 25 lookalikes.
 *
 * Inserted candidates carry score_dimensions.lookalike_of = seedId so
 * the UI can group them visually.
 *
 * Auth: cookie SSR.
 */

import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import type { Database, MissionBrief, ScoreDimensions } from "@/lib/database.types"
import { searchLinkedInForBrief } from "@/lib/google-cse"
import { scoreProfiles } from "@/lib/profile-pipeline"

const MAX_LOOKALIKES = 25
const MIN_SCORE = 40

export async function POST(
  req: NextRequest,
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

  let body: { seedCandidateId?: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }
  const seedId = body.seedCandidateId
  if (!seedId) return NextResponse.json({ error: "seedCandidateId requis" }, { status: 400 })

  // Load mission + seed candidate (verify ownership in one shot)
  const { data: mission } = await sb
    .from("missions")
    .select("id, brief, user_id")
    .eq("id", missionId)
    .eq("user_id", user.id)
    .single()
  if (!mission) return NextResponse.json({ error: "Mission introuvable" }, { status: 404 })

  const { data: seed } = await sb
    .from("candidates")
    .select("id, name_estimated, title_estimated, company, linkedin_url, keywords")
    .eq("id", seedId)
    .eq("mission_id", missionId)
    .single()
  if (!seed) return NextResponse.json({ error: "Profil source introuvable" }, { status: 404 })

  const brief = (mission.brief ?? {}) as MissionBrief
  if (!brief.titre_poste) {
    return NextResponse.json({ error: "Brief incomplet" }, { status: 400 })
  }

  // Build queries that look for similar profiles. Combine the seed's
  // job title + brief's location + a couple of strong keywords.
  const seedTitle = (seed.title_estimated || brief.titre_poste).slice(0, 80)
  const seedKw    = (seed.keywords ?? []).slice(0, 3)
  const briefKw   = (brief.mots_cles ?? []).slice(0, 3)
  const loc       = (brief.localisation || "France").trim()
  const locTok    = `"${loc}"`

  const queries = uniq([
    `site:linkedin.com/in "${seedTitle}" ${locTok}`,
    seedKw[0] ? `site:linkedin.com/in "${seedTitle}" "${seedKw[0]}" ${locTok}` : "",
    seedKw[1] ? `site:linkedin.com/in "${seedTitle}" "${seedKw[1]}" ${locTok}` : "",
    seed.company ? `site:linkedin.com/in "${seedTitle}" "${seed.company}" ${locTok}` : "",
    briefKw[0] ? `site:linkedin.com/in "${seedTitle}" "${briefKw[0]}" ${locTok}` : "",
    briefKw[1] ? `site:linkedin.com/in "${seedTitle}" "${briefKw[1]}" ${locTok}` : "",
  ].filter(Boolean))

  const found = (await searchLinkedInForBrief(queries)).slice(0, MAX_LOOKALIKES + 5)
  if (found.length === 0) {
    return NextResponse.json({ ok: false, error: "Aucun profil similaire trouvé." }, { status: 200 })
  }

  // Score against the mission brief
  let scored: import("@/lib/profile-pipeline").ScoredProfile[] = []
  try {
    scored = await scoreProfiles({
      titre_poste:  brief.titre_poste,
      localisation: brief.localisation,
      criteres:     brief.criteres,
      mots_cles:    brief.mots_cles,
    }, found)
  } catch (e) {
    console.warn("[lookalike] scoring failed:", e)
    scored = found.map(p => ({ ...p, relevance_score: 50, score_justification: "", seniority_level: "" }))
  }

  // Drop low-score, dedupe against existing candidates, exclude the seed itself
  const { data: existing } = await sb
    .from("candidates")
    .select("linkedin_url")
    .eq("mission_id", missionId)
  const existingUrls = new Set((existing ?? []).map((r) => (r.linkedin_url ?? "").toLowerCase()))

  const seedLabel = compactLabel(seed.name_estimated, seed.title_estimated, seed.company)

  const fresh = scored
    .filter((p) => (p.relevance_score ?? 0) >= MIN_SCORE)
    .filter((p) => !existingUrls.has((p.linkedin_url ?? "").toLowerCase()))
    .slice(0, MAX_LOOKALIKES)

  if (fresh.length === 0) {
    return NextResponse.json({ ok: false, error: "Aucun nouveau profil similaire pertinent trouvé." }, { status: 200 })
  }

  const rows = fresh.map((p) => {
    const dims: ScoreDimensions = {
      competences:  p.score_dimensions?.competences  ?? 50,
      seniorite:    p.score_dimensions?.seniorite    ?? 50,
      localisation: p.score_dimensions?.localisation ?? 50,
      qualite:      p.score_dimensions?.qualite      ?? 50,
      lookalike_of: seedId,
      lookalike_seed_label: seedLabel,
    }
    const source: "linkedin" | "malt" =
      (p.linkedin_url ?? "").includes("malt.fr") || (p.linkedin_url ?? "").includes("malt.com")
        ? "malt" : "linkedin"
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
      score_dimensions:    dims,
      seniority_level:     p.seniority_level || null,
      source,
      status:              "raw" as const,
    }
  })

  const { error: insErr } = await sb.from("candidates").insert(rows)
  if (insErr) {
    console.error("[lookalike] insert error:", insErr)
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    inserted: rows.length,
    seedLabel,
  })
}

function compactLabel(name?: string | null, title?: string | null, company?: string | null) {
  const n = (name || "").trim()
  const t = (title || "").trim()
  const c = (company || "").trim()
  if (n) {
    const subtitle = [t, c].filter(Boolean).join(" · ").slice(0, 50)
    return subtitle ? `${n} — ${subtitle}` : n
  }
  return [t, c].filter(Boolean).join(" · ").slice(0, 60) || "Profil"
}

function uniq(arr: string[]) { return Array.from(new Set(arr)) }
