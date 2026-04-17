/**
 * DELETE /api/missions/[missionId]
 * Permanently deletes a mission, its candidates, and optionally cleans up
 * the VPS agent data.
 */

import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import type { Database } from "@/lib/database.types"
import { getAgentBaseUrl, agentHeaders } from "@/lib/agent-proxy"

export async function DELETE(
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
            toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          } catch {}
        },
      },
    }
  )

  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Verify mission belongs to this user
  const { data: mission } = await sb
    .from("missions")
    .select("id, agent_level")
    .eq("id", missionId)
    .eq("user_id", user.id)
    .single()

  if (!mission) return NextResponse.json({ error: "Mission not found" }, { status: 404 })

  // 1. Try to notify VPS agent to clean up mission data (non-blocking)
  try {
    const baseUrl = await getAgentBaseUrl(user.id, mission.agent_level)
    await fetch(`${baseUrl}/missions/${missionId}/delete`, {
      method: "DELETE",
      headers: agentHeaders(),
      signal: AbortSignal.timeout(4000),
    })
  } catch {
    // VPS cleanup failure is non-critical — continue with DB cleanup
  }

  // 2. Delete booking_links (cascade from candidates)
  const { data: candidateIds } = await sb
    .from("candidates")
    .select("id")
    .eq("mission_id", missionId)

  if (candidateIds && candidateIds.length > 0) {
    const ids = candidateIds.map((c) => c.id)
    await sb.from("booking_links").delete().in("candidate_id", ids)
  }

  // 3. Delete all candidates
  await sb.from("candidates").delete().eq("mission_id", missionId)

  // 4. Delete the mission
  const { error } = await sb.from("missions").delete().eq("id", missionId).eq("user_id", user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
