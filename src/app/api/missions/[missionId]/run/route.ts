/**
 * POST /api/missions/[missionId]/run
 * Launches a mission on the user's agent (VPS or Docker via NAWA_AGENT_URL).
 * Stores the agent's internal mission_id inside the brief JSONB (__agent_id).
 */

import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { getAgentBaseUrl, agentHeaders } from "@/lib/agent-proxy"
import type { Database } from "@/lib/database.types"
import type { MissionBrief } from "@/lib/database.types"

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
          for (const { name, value, options } of toSet) cookieStore.set(name, value, options)
        },
      },
    }
  )

  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })

  // ── Load mission + verify ownership ─────────────────────────────────────────
  const { data: mission } = await sb
    .from("missions")
    .select("*")
    .eq("id", missionId)
    .eq("user_id", user.id)
    .single()

  if (!mission) return NextResponse.json({ error: "Mission not found" }, { status: 404 })
  if (!mission.brief) return NextResponse.json({ error: "Brief not configured" }, { status: 400 })
  if (mission.status === "in_progress") return NextResponse.json({ error: "Already running" }, { status: 409 })

  // ── Get agent URL ────────────────────────────────────────────────────────────
  let agentBase: string
  try {
    agentBase = await getAgentBaseUrl(user.id)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 503 })
  }

  // ── Call agent ───────────────────────────────────────────────────────────────
  const agentRes = await fetch(`${agentBase}/missions`, {
    method: "POST",
    headers: agentHeaders(),
    body: JSON.stringify({ brief: mission.brief }),
  })

  if (!agentRes.ok) {
    const err = await agentRes.text()
    return NextResponse.json({ error: `Agent error: ${err}` }, { status: 502 })
  }

  const { mission_id: agentMissionId } = await agentRes.json() as { mission_id: string }

  // ── Store agent_id in brief.__agent_id + mark in_progress ──────────────────
  const updatedBrief: MissionBrief & { __agent_id?: string } = {
    ...(mission.brief as MissionBrief),
    __agent_id: agentMissionId,
  }

  await sb
    .from("missions")
    .update({ status: "in_progress", brief: updatedBrief })
    .eq("id", missionId)

  return NextResponse.json({ ok: true, agent_mission_id: agentMissionId })
}
