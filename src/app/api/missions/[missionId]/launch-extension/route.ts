/**
 * POST /api/missions/[missionId]/launch-extension
 *
 * Cookie-auth endpoint called from the workspace chat when the user confirms
 * "lancer la recherche". Returns the brief + Google queries the extension
 * should run, and marks the mission as in_progress.
 *
 * The workspace then forwards this payload to the extension via
 * window.postMessage → content_nawa.js bridge → background.js worker tab.
 */

import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import type { Database, MissionBrief } from "@/lib/database.types"
import { generateQueriesFromBrief } from "@/lib/extension-queries"

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ missionId: string }> }
) {
  const { missionId } = await params

  const cookieStore = await cookies()
  const sb = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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

  // Quota Apify check (cohérent avec /run)
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

  // Generate Google queries from the structured brief
  const queries = await generateQueriesFromBrief(brief, level)
  if (queries.length === 0) {
    return NextResponse.json({ error: "Aucune requête générée" }, { status: 500 })
  }

  // Mark mission running. Reset stale extension metadata in the brief.
  const briefWithMeta: MissionBrief = {
    ...brief,
    __source: "extension_chat",
    __user_id: user.id,
    __mission_id: missionId,
  }
  await sb
    .from("missions")
    .update({ status: "in_progress", brief: briefWithMeta })
    .eq("id", missionId)

  return NextResponse.json({
    ok: true,
    missionId,
    title: mission.title,
    level,
    brief: {
      titre_poste: brief.titre_poste,
      localisation: brief.localisation,
      criteres: brief.criteres ?? "",
      mots_cles: brief.mots_cles ?? [],
    },
    queries,
  })
}
