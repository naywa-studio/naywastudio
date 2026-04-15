/**
 * POST /api/missions/[missionId]/download
 * Fetches the Excel result from the agent, saves candidates to Supabase,
 * marks the mission as completed, and returns the Excel as base64.
 */

import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { createClient } from "@supabase/supabase-js"
import { cookies } from "next/headers"
import { getAgentBaseUrl, agentHeaders } from "@/lib/agent-proxy"
import type { Database } from "@/lib/database.types"
import type { MissionBrief } from "@/lib/database.types"

interface AgentCandidate {
  linkedin_url: string
  name_estimated: string | null
  title_estimated: string | null
  company: string | null
  keywords: string[]
  relevance_score?: number | null
  score_justification?: string | null
  message?: string | null
}

interface AgentResult {
  result: string              // base64 Excel
  candidates?: AgentCandidate[]
}

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

  const { data: mission } = await sb
    .from("missions")
    .select("brief, status")
    .eq("id", missionId)
    .eq("user_id", user.id)
    .single()

  if (!mission) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const brief = mission.brief as (MissionBrief & { __agent_id?: string }) | null
  const agentMissionId = brief?.__agent_id
  if (!agentMissionId) return NextResponse.json({ error: "No agent mission id" }, { status: 400 })

  let agentBase: string
  try {
    agentBase = await getAgentBaseUrl(user.id)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 503 })
  }

  // ── Fetch result from agent ──────────────────────────────────────────────────
  const res = await fetch(`${agentBase}/missions/${agentMissionId}/result`, {
    headers: agentHeaders(),
  })

  if (!res.ok) {
    return NextResponse.json({ error: `Agent error: ${res.status}` }, { status: 502 })
  }

  const agentData = await res.json() as AgentResult

  // ── Save candidates to Supabase (service role — bypasses RLS insert rules) ──
  const sbAdmin = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  if (agentData.candidates && agentData.candidates.length > 0) {
    const rows = agentData.candidates.map((c) => ({
      mission_id: missionId,
      user_id: user.id,
      linkedin_url: c.linkedin_url,
      name_estimated: c.name_estimated ?? null,
      title_estimated: c.title_estimated ?? null,
      company: c.company ?? null,
      keywords: c.keywords ?? [],
      relevance_score: c.relevance_score ?? null,
      score_justification: c.score_justification ?? null,
      message_draft: c.message ?? null,
      status: (c.relevance_score != null && c.relevance_score >= 60)
        ? "shortlisted" as const
        : "raw" as const,
    }))

    await sbAdmin.from("candidates").insert(rows)
  }

  // ── Update mission status ────────────────────────────────────────────────────
  await sbAdmin
    .from("missions")
    .update({
      status: "completed",
      profiles_count: agentData.candidates?.length ?? 0,
    })
    .eq("id", missionId)

  // ── Return Excel base64 + candidate count ────────────────────────────────────
  return NextResponse.json({
    ok: true,
    excel_b64: agentData.result,
    candidates_count: agentData.candidates?.length ?? 0,
  })
}
