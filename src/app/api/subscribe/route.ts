/**
 * POST /api/subscribe { level: "nora" }
 *
 * The legacy multi-agent flow (Léo / Nora / Alex with per-client VPS)
 * has been retired. The product is now a single product around Nora —
 * the CV intelligence CRM. This endpoint stays as a no-op grant that
 * just attaches the user to the "nora" tier so the workspace UI loads.
 */

import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import type { Database } from "@/lib/database.types"

export async function POST(_req: NextRequest) { void _req;
  const cookieStore = await cookies()
  const sb = createServerClient<Database>(
    (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim(),
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim(),
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

  const { data: profile } = await sb
    .from("profiles")
    .select("subscription_level")
    .eq("user_id", user.id)
    .single()

  if (profile?.subscription_level) {
    return NextResponse.json({ ok: true, level: profile.subscription_level, status: "ready" })
  }

  const now = new Date().toISOString()
  const { error: updateErr } = await sb
    .from("profiles")
    .update({
      subscription_level: "nora",
      subscribed_at: now,
      vps_status:    "ready",
      agent_status:  "running",
    })
    .eq("user_id", user.id)

  if (updateErr) {
    console.error("[subscribe] profile update error:", updateErr)
    return NextResponse.json({ error: "DB error" }, { status: 500 })
  }

  return NextResponse.json({ ok: true, level: "nora", status: "ready" })
}
