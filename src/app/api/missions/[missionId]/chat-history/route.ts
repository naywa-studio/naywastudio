/**
 * PATCH /api/missions/[missionId]/chat-history
 * Saves the BriefChat message history for a given mission.
 */

import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { createClient } from "@supabase/supabase-js"
import { cookies } from "next/headers"
import type { Database, ChatHistoryMsg } from "@/lib/database.types"

const MAX_MESSAGES = 100

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ missionId: string }> }
) {
  const { missionId } = await params
  const cookieStore = await cookies()

  // Auth client (anon key) — for session check
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

  // Verify mission ownership
  const { data: mission } = await sb
    .from("missions")
    .select("id")
    .eq("id", missionId)
    .eq("user_id", user.id)
    .single()

  if (!mission) return NextResponse.json({ error: "Mission not found" }, { status: 404 })

  // Parse body
  let messages: ChatHistoryMsg[]
  try {
    const body = await req.json() as { messages: ChatHistoryMsg[] }
    messages = body.messages
    if (!Array.isArray(messages)) throw new Error("invalid payload")
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 })
  }

  // Limit to MAX_MESSAGES
  const trimmed = messages.slice(-MAX_MESSAGES)

  // Service role client — bypass RLS for update
  const sbAdmin = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { error } = await sbAdmin
    .from("missions")
    .update({ chat_history: trimmed })
    .eq("id", missionId)
    .eq("user_id", user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
