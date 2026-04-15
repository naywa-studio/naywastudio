/**
 * Polled by the workspace every 10s to check VPS provisioning status.
 * Returns the current vps_status and agent_status for the authenticated user.
 */

import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import type { Database } from "@/lib/database.types"

export async function GET(_req: NextRequest) {
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

  const { data: profile } = await sb
    .from("profiles")
    .select("vps_status, agent_status, subscription_level")
    .eq("user_id", user.id)
    .single()

  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 })
  }

  return NextResponse.json({
    vps_status: profile.vps_status,
    agent_status: profile.agent_status,
    subscription_level: profile.subscription_level,
    ready: profile.vps_status === "ready" && profile.agent_status === "running",
  })
}
