/**
 * POST /api/missions/[missionId]/profiles
 *
 * Bearer-auth endpoint called by the extension worker tab once the Google
 * scrape (+ optional LinkedIn enrichment) is complete.
 *
 * - Dedupes profiles against existing candidates (linkedin_url)
 * - Scores via OpenRouter
 * - Inserts candidates → triggers Realtime updates on the mission page
 * - Builds Excel and stores it in brief.__excel_b64
 * - Marks mission "completed" when final=true
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import type { Database, MissionBrief } from "@/lib/database.types"
import {
  scoreProfiles, buildExcel, dedupeByLinkedinUrl,
  type RawProfile,
} from "@/lib/profile-pipeline"

const sbAdmin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function getUserFromBearer(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? ""
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : ""
  if (!token) return null
  const { data: { user }, error } = await sbAdmin.auth.getUser(token)
  if (error || !user) return null
  return user
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ missionId: string }> }
) {
  const { missionId } = await params

  const user = await getUserFromBearer(req)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: { profiles: RawProfile[]; final?: boolean }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const profiles = Array.isArray(body.profiles) ? body.profiles : []
  const final = body.final !== false // default true — extension always pushes once

  // Verify mission ownership
  const { data: mission, error: mErr } = await sbAdmin
    .from("missions")
    .select("id, title, brief, user_id, status, profiles_count")
    .eq("id", missionId)
    .eq("user_id", user.id)
    .single()

  if (mErr || !mission) {
    return NextResponse.json({ error: "Mission introuvable" }, { status: 404 })
  }

  const brief = (mission.brief ?? {}) as MissionBrief
  if (!brief.titre_poste) {
    return NextResponse.json({ error: "Mission sans brief" }, { status: 400 })
  }

  // Dedupe against any candidates already in the mission
  const { data: existing } = await sbAdmin
    .from("candidates")
    .select("linkedin_url")
    .eq("mission_id", missionId)

  const existingKeys = new Set(
    (existing ?? [])
      .map(c => (c.linkedin_url ?? "").split("?")[0].toLowerCase().replace(/\/$/, ""))
      .filter(Boolean)
  )

  const fresh = dedupeByLinkedinUrl(profiles).filter(p => {
    const k = p.linkedin_url.split("?")[0].toLowerCase().replace(/\/$/, "")
    return !existingKeys.has(k)
  })

  console.log(
    `[missions/${missionId}/profiles] user=${user.id} pushed=${profiles.length} ` +
    `fresh=${fresh.length} final=${final}`
  )

  // Score the fresh batch
  const scored = await scoreProfiles(
    {
      titre_poste:  brief.titre_poste,
      localisation: brief.localisation,
      criteres:     brief.criteres,
      mots_cles:    brief.mots_cles,
    },
    fresh
  )

  // Insert candidates
  if (scored.length > 0) {
    const rows = scored.map(p => ({
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
    const { error: cErr } = await sbAdmin.from("candidates").insert(rows)
    if (cErr) console.error("[missions/profiles] candidates insert error:", cErr)
  }

  // Recount and finalize if needed
  const { count: totalCount } = await sbAdmin
    .from("candidates")
    .select("id", { count: "exact", head: true })
    .eq("mission_id", missionId)

  const newCount = totalCount ?? 0

  if (final) {
    // Build Excel from ALL candidates (not just the fresh batch)
    const { data: allCandidates } = await sbAdmin
      .from("candidates")
      .select("*")
      .eq("mission_id", missionId)
      .order("relevance_score", { ascending: false })

    const allRaw = (allCandidates ?? []).map(c => ({
      linkedin_url:        c.linkedin_url ?? "",
      name:                c.name_estimated ?? "",
      title:               c.title_estimated ?? "",
      company:             c.company ?? "",
      location:            "",
      snippet:             c.score_justification ?? "",
      relevance_score:     c.relevance_score ?? 50,
      score_justification: c.score_justification ?? "",
      seniority_level:     c.seniority_level ?? "",
    }))

    const excelB64 = buildExcel(allRaw as never, {
      titre_poste:  brief.titre_poste,
      localisation: brief.localisation,
      criteres:     brief.criteres,
      mots_cles:    brief.mots_cles,
    })

    const updatedBrief: MissionBrief = {
      ...brief,
      __excel_b64: excelB64,
      __source:    "extension_chat",
    }

    await sbAdmin
      .from("missions")
      .update({
        status:         newCount > 0 ? "completed" : "error",
        profiles_count: newCount,
        brief:          updatedBrief,
      })
      .eq("id", missionId)
  } else {
    await sbAdmin
      .from("missions")
      .update({ profiles_count: newCount })
      .eq("id", missionId)
  }

  return NextResponse.json({
    ok: true,
    inserted: scored.length,
    total: newCount,
    final,
  })
}
