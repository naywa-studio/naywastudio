/**
 * POST /api/missions/[missionId]/clone
 *
 * Creates a new mission inheriting the brief of the source mission.
 * No candidates copied — the clone starts fresh in `preparation` so
 * the user can edit the brief before launching.
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

  const { data: source } = await sb
    .from("missions")
    .select("id, title, brief, agent_level, user_id")
    .eq("id", missionId)
    .eq("user_id", user.id)
    .single()
  if (!source) return NextResponse.json({ error: "Mission source introuvable" }, { status: 404 })

  const oldBrief = (source.brief ?? {}) as MissionBrief
  const cleanBrief: MissionBrief = {
    titre_poste:  oldBrief.titre_poste,
    localisation: oldBrief.localisation,
    mots_cles:    oldBrief.mots_cles ?? [],
    criteres:     oldBrief.criteres,
    ton:          oldBrief.ton,
  }

  // Generate a new title with " (copie)" suffix, capped to fit the column
  const baseTitle = (source.title ?? "Mission").replace(/\s*\(copie(?:\s*\d+)?\)\s*$/i, "").trim()
  const title     = `${baseTitle} (copie)`.slice(0, 80)

  const { data: cloned, error: insErr } = await sb
    .from("missions")
    .insert({
      user_id:        user.id,
      title,
      brief:          cleanBrief,
      agent_level:    source.agent_level,
      status:         "preparation",
      profiles_count: 0,
    })
    .select()
    .single()

  if (insErr || !cloned) {
    console.error("[clone] insert error:", insErr)
    return NextResponse.json({ error: "Erreur clonage" }, { status: 500 })
  }

  return NextResponse.json({ ok: true, missionId: cloned.id, title: cloned.title })
}
