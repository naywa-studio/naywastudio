import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { provisionInBackground } from "@/lib/vps"
import type { Database } from "@/lib/database.types"

type Level = "leo" | "nora"
const VALID_LEVELS: Level[] = ["leo", "nora"]

export async function POST(req: NextRequest) {
  // ── Parse body ────────────────────────────────────────────────────────────
  let level: Level
  try {
    const body = await req.json()
    if (!VALID_LEVELS.includes(body.level)) {
      return NextResponse.json({ error: "Invalid level" }, { status: 400 })
    }
    level = body.level
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  // ── Auth check (server-side session) ─────────────────────────────────────
  const cookieStore = await cookies()
  const sb = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          for (const { name, value, options } of toSet) {
            cookieStore.set(name, value, options)
          }
        },
      },
    }
  )

  const { data: { user } } = await sb.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })
  }

  // ── Check not already subscribed ──────────────────────────────────────────
  const { data: profile } = await sb
    .from("profiles")
    .select("subscription_level, vps_status")
    .eq("user_id", user.id)
    .single()

  if (profile?.subscription_level) {
    return NextResponse.json(
      { error: "Already subscribed", level: profile.subscription_level },
      { status: 409 }
    )
  }

  // ── Update profile → mark pending ─────────────────────────────────────────
  const now = new Date().toISOString()
  const { error: updateErr } = await sb
    .from("profiles")
    .update({
      subscription_level: level,
      subscribed_at: now,
      vps_status: "pending",
      agent_status: "not_deployed",
    })
    .eq("user_id", user.id)

  if (updateErr) {
    console.error("[subscribe] profile update error:", updateErr)
    return NextResponse.json({ error: "DB error" }, { status: 500 })
  }

  // ── Trigger VPS provisioning in background (non-blocking) ─────────────────
  // We don't await — Vercel will keep the execution context alive
  // until the response is sent; the background task continues independently.
  provisionInBackground(user.id, level).catch((err) =>
    console.error("[subscribe] background provision failed:", err)
  )

  return NextResponse.json({ ok: true, level, status: "pending" })
}
