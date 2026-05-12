/**
 * DELETE /api/missions/[missionId]
 * Permanently deletes a mission and its candidates.
 *
 * The legacy VPS cleanup branch was removed when the per-client VPS
 * architecture was retired in favour of the all-in-one Nora CRM model.
 */

import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import type { Database } from "@/lib/database.types"

export async function DELETE(
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
            toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          } catch { /* ignore */ }
        },
      },
    }
  )

  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Verify mission belongs to this user
  const { data: mission } = await sb
    .from("missions")
    .select("id")
    .eq("id", missionId)
    .eq("user_id", user.id)
    .single()

  if (!mission) return NextResponse.json({ error: "Mission not found" }, { status: 404 })

  // Cascade: booking_links → candidates → mission
  const { data: candidateIds } = await sb
    .from("candidates")
    .select("id")
    .eq("mission_id", missionId)

  if (candidateIds && candidateIds.length > 0) {
    const ids = candidateIds.map((c) => c.id)
    await sb.from("booking_links").delete().in("candidate_id", ids)
  }

  await sb.from("candidates").delete().eq("mission_id", missionId)
  const { error } = await sb.from("missions").delete().eq("id", missionId).eq("user_id", user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
