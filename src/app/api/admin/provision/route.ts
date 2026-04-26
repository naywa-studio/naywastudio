/**
 * POST /api/admin/provision
 * Admin-only endpoint to set up or reset an account's subscription + trigger VPS provisioning.
 * Bypasses the "already subscribed" guard — useful for test/admin accounts.
 *
 * Body: { level: "leo" | "nora" | "alex", reset?: boolean }
 *
 * Security: only ADMIN_EMAILS can call this route.
 */

import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { createClient } from "@supabase/supabase-js"
import { cookies } from "next/headers"
import { waitUntil } from "@vercel/functions"
import { provisionInBackground } from "@/lib/vps"
import type { Database } from "@/lib/database.types"

// Allow up to 800s for the background provisioning to complete (Vercel Pro)
export const maxDuration = 800

type Level = "leo" | "nora" | "alex"
const VALID_LEVELS: Level[] = ["leo", "nora", "alex"]

// Emails that are allowed to call this route
const ADMIN_EMAILS = ["elyas.malki1003@gmail.com"]

function supabaseAdmin() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(req: NextRequest) {
  // ── Auth check ────────────────────────────────────────────────────────────
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
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })

  // ── Admin email check ────────────────────────────────────────────────────
  if (!ADMIN_EMAILS.includes(user.email ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let level: Level
  let reset = false
  try {
    const body = await req.json()
    if (!VALID_LEVELS.includes(body.level)) {
      return NextResponse.json({ error: "Invalid level" }, { status: 400 })
    }
    level = body.level
    reset = body.reset === true
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const sbAdmin = supabaseAdmin()

  // ── Check existing subscription (unless reset) ───────────────────────────
  const { data: profile } = await sbAdmin
    .from("profiles")
    .select("subscription_level, vps_status, vps_id")
    .eq("user_id", user.id)
    .single()

  if (profile?.subscription_level && !reset) {
    return NextResponse.json(
      { error: "Already subscribed — pass reset: true to re-provision", level: profile.subscription_level },
      { status: 409 }
    )
  }

  // ── Update profile → pending ──────────────────────────────────────────────
  const now = new Date().toISOString()
  const { error: updateErr } = await sbAdmin
    .from("profiles")
    .update({
      subscription_level: level,
      subscribed_at: now,
      vps_status: "pending",
      agent_status: "not_deployed",
      vps_id: null,
      vps_ip: null,
    })
    .eq("user_id", user.id)

  if (updateErr) {
    console.error("[admin/provision] profile update error:", updateErr)
    return NextResponse.json({ error: "DB error" }, { status: 500 })
  }

  // ── Trigger provisioning (kept alive via waitUntil) ───────────────────────
  waitUntil(
    provisionInBackground(user.id, level).catch((err) =>
      console.error("[admin/provision] background provision failed:", err)
    )
  )

  return NextResponse.json({ ok: true, level, status: "pending", reset })
}
