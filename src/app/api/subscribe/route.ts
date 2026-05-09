import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { provisionInBackground } from "@/lib/vps"
import type { Database } from "@/lib/database.types"

type Level = "leo" | "nora" | "alex"
const VALID_LEVELS: Level[] = ["leo", "nora", "alex"]

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

  // ── Léo runs entirely server-side (no VPS needed) ────────────────────────
  // Léo's flow: extension silent fetch → /run-server-search fallback → done.
  // Skip the Hostinger VPS provisioning entirely → instant access.
  const isLeoFreeTier = level === "leo"

  const now = new Date().toISOString()
  const { error: updateErr } = await sb
    .from("profiles")
    .update({
      subscription_level: level,
      subscribed_at: now,
      vps_status:    isLeoFreeTier ? "ready"   : "pending",
      agent_status:  isLeoFreeTier ? "running" : "not_deployed",
    })
    .eq("user_id", user.id)

  if (updateErr) {
    console.error("[subscribe] profile update error:", updateErr)
    return NextResponse.json({ error: "DB error" }, { status: 500 })
  }

  // For Nora/Alex (legacy paid tiers), still trigger VPS provisioning.
  if (!isLeoFreeTier) {
    provisionInBackground(user.id, level).catch((err) =>
      console.error("[subscribe] background provision failed:", err)
    )
  }

  return NextResponse.json({
    ok: true,
    level,
    status: isLeoFreeTier ? "ready" : "pending",
  })
}
