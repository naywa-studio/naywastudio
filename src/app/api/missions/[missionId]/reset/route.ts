/**
 * POST /api/missions/[missionId]/reset
 *
 * Wipes all candidates of a mission and resets it to the `preparation`
 * status so the user can re-run a clean search with the same brief.
 * Booking links cascade-delete with candidates already.
 *
 * Auth: cookie SSR.
 */

import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import type { Database, MissionBrief } from "@/lib/database.types"

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
    .select("id, brief, status, user_id")
    .eq("id", missionId)
    .eq("user_id", user.id)
    .single()
  if (!mission) return NextResponse.json({ error: "Mission introuvable" }, { status: 404 })
  if (mission.status === "in_progress") {
    return NextResponse.json({ error: "Recherche en cours — annule-la avant de réinitialiser." }, { status: 409 })
  }

  // Delete booking_links first (FK), then candidates, then reset mission
  const { data: candidateIds } = await sb.from("candidates").select("id").eq("mission_id", missionId)
  if (candidateIds && candidateIds.length > 0) {
    await sb.from("booking_links").delete().in("candidate_id", candidateIds.map((c) => c.id))
  }
  await sb.from("candidates").delete().eq("mission_id", missionId)

  // Strip ephemeral fields from brief but keep the user-provided ones
  const oldBrief = (mission.brief ?? {}) as MissionBrief & {
    __excel_b64?: string
    __error?: string | null
    __completed_at?: string
    __block_reason?: string | null
  }
  const cleanBrief: MissionBrief = {
    titre_poste:  oldBrief.titre_poste,
    localisation: oldBrief.localisation,
    mots_cles:    oldBrief.mots_cles ?? [],
    criteres:     oldBrief.criteres,
    ton:          oldBrief.ton,
  }

  await sb
    .from("missions")
    .update({
      status:          "preparation",
      profiles_count:  0,
      brief:           cleanBrief,
    })
    .eq("id", missionId)

  return NextResponse.json({ ok: true })
}
