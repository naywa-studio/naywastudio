/**
 * GET /api/missions/[missionId]/agent-status
 * Polls the agent for the current mission status.
 * Returns { status: "running" | "done" | "error", error?: string }
 */

import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { getAgentBaseUrl, agentHeaders } from "@/lib/agent-proxy"
import type { Database } from "@/lib/database.types"
import type { MissionBrief } from "@/lib/database.types"

export async function GET(
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
          for (const { name, value, options } of toSet) cookieStore.set(name, value, options)
        },
      },
    }
  )

  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })

  const { data: mission } = await sb
    .from("missions")
    .select("brief, status, agent_level")
    .eq("id", missionId)
    .eq("user_id", user.id)
    .single()

  if (!mission) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Already completed or errored in DB
  if (mission.status === "completed") return NextResponse.json({ status: "done" })
  if (mission.status === "error") return NextResponse.json({ status: "error", error: "Mission failed" })

  const brief = mission.brief as (MissionBrief & { __agent_id?: string; __source?: string }) | null

  // Extension-sourced missions are processed entirely on Vercel — no VPS polling needed
  if (brief?.__source === "extension_linkedin") {
    return NextResponse.json({ status: "done" })
  }

  const agentMissionId = brief?.__agent_id
  if (!agentMissionId) return NextResponse.json({ status: "error", error: "No agent mission id" })

  let agentBase: string
  try {
    agentBase = await getAgentBaseUrl(user.id, mission.agent_level)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 503 })
  }

  const res = await fetch(`${agentBase}/missions/${agentMissionId}/status`, {
    headers: agentHeaders(),
  })

  if (!res.ok) {
    return NextResponse.json({ status: "error", error: `Agent unreachable (${res.status})` })
  }

  const data = await res.json() as { status: string; error?: string }
  // Normalize agent "completed" → "done" for the client
  const normalizedStatus = data.status === "completed" ? "done" : data.status
  return NextResponse.json({ ...data, status: normalizedStatus })
}
