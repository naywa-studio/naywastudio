/**
 * GET /api/missions/[missionId]/status
 *
 * Lightweight status endpoint for clients (and tests) that need to poll a
 * mission's current state without subscribing to Realtime. Returns the
 * mission row and the live candidate count.
 */

import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import type { Database } from "@/lib/database.types"

export async function GET(
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
    .select("id, title, status, profiles_count, agent_level, brief")
    .eq("id", missionId)
    .eq("user_id", user.id)
    .single()
  if (!mission) return NextResponse.json({ error: "Mission not found" }, { status: 404 })

  const { count } = await sb
    .from("candidates")
    .select("id", { count: "exact", head: true })
    .eq("mission_id", missionId)

  return NextResponse.json({
    mission: {
      id:             mission.id,
      title:          mission.title,
      status:         mission.status,
      profiles_count: mission.profiles_count ?? 0,
      agent_level:    mission.agent_level,
    },
    candidatesCount: count ?? 0,
    error:           (mission.brief as Record<string, unknown> | null)?.__error ?? null,
  })
}
