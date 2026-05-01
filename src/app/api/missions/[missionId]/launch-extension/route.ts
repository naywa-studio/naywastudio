/**
 * POST /api/missions/[missionId]/launch-extension
 *
 * Called from the workspace chat when the user confirms "lancer la
 * recherche". Validates the mission, marks it `in_progress`, and returns
 * the brief + Google queries the extension should run.
 *
 * The extension then fetches google.com from background.js (silent — no
 * tab, no CAPTCHA, the user's residential IP and cookies are used) and
 * POSTs the resulting LinkedIn URLs to /api/missions/[id]/profiles for
 * scoring + insert.
 *
 * If the user has no extension installed, the chat client calls
 * /api/missions/[id]/run-server-search next as a fallback — that endpoint
 * runs the search server-side via Google Custom Search API.
 *
 * Auth: cookie SSR.
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
    .select("id, title, brief, agent_level, status, user_id")
    .eq("id", missionId)
    .eq("user_id", user.id)
    .single()
  if (!mission) return NextResponse.json({ error: "Mission introuvable" }, { status: 404 })
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
      return NextResponse.json({ error: "Quota mensuel atteint (1 000 profils)." }, { status: 429 })
    }
  }

  const level = (mission.agent_level === "nora" ? "nora" : "leo") as "leo" | "nora"
  const brief = mission.brief as MissionBrief

  const queries = await generateQueriesFromBrief(brief, level)
  if (queries.length === 0) {
    return NextResponse.json({ error: "Aucune requête générée" }, { status: 500 })
  }

  await sb
    .from("missions")
    .update({
      status: "in_progress",
      brief:  { ...brief, __source: "extension_chat", __user_id: user.id, __mission_id: missionId, __error: null },
    })
    .eq("id", missionId)

  return NextResponse.json({
    ok:        true,
    missionId,
    title:     mission.title,
    level,
    brief: {
      titre_poste:  brief.titre_poste,
      localisation: brief.localisation,
      criteres:     brief.criteres ?? "",
      mots_cles:    brief.mots_cles ?? [],
    },
    queries,
  })
}
