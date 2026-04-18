/**
 * POST /api/missions/[missionId]/pipeline-report
 * Alex (N3) only — generates an LLM analysis of the pipeline state.
 */

import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import type { Database } from "@/lib/database.types"
import { getAgentBaseUrl, agentHeaders } from "@/lib/agent-proxy"

export async function POST(
  req: NextRequest,
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
          try { toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {}
        },
      },
    }
  )

  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: profile } = await sb.from("profiles").select("subscription_level").eq("user_id", user.id).single()
  if (profile?.subscription_level !== "alex") {
    return NextResponse.json({ error: "Alex (N3) subscription required" }, { status: 403 })
  }

  const { data: mission } = await sb
    .from("missions")
    .select("id, brief")
    .eq("id", missionId)
    .eq("user_id", user.id)
    .single()

  if (!mission) return NextResponse.json({ error: "Mission not found" }, { status: 404 })

  const body = await req.json() as {
    stages: Record<string, number>
    avg_score: number
  }

  const brief = mission.brief as { titre_poste?: string } | null

  try {
    const baseUrl = await getAgentBaseUrl(user.id, "alex")
    const res = await fetch(`${baseUrl}/pipeline-report`, {
      method: "POST",
      headers: agentHeaders(),
      body: JSON.stringify({
        job_title: brief?.titre_poste ?? "ce poste",
        stages: body.stages,
        avg_score: body.avg_score,
      }),
      signal: AbortSignal.timeout(40000),
    })

    if (!res.ok) {
      const err = await res.text()
      return NextResponse.json({ error: err }, { status: res.status })
    }

    const data = await res.json() as { report: string }
    return NextResponse.json(data)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
