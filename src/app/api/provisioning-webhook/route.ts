/**
 * Called by the VPS itself once the agent is running.
 * Authenticated via X-Nawa-Secret header (shared secret).
 * Body: { user_id: string, ip: string }
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/database.types"

export async function POST(req: NextRequest) {
  // ── Verify shared secret ──────────────────────────────────────────────────
  const secret = req.headers.get("x-nawa-secret")
  if (!secret || secret !== process.env.NAWA_AGENT_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let userId: string, ip: string
  try {
    const body = await req.json()
    userId = body.user_id
    ip = body.ip
    if (!userId || !ip) throw new Error("Missing fields")
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 })
  }

  // ── Update profile with VPS IP and ready status ───────────────────────────
  const sb = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { error } = await sb
    .from("profiles")
    .update({
      vps_ip: ip,
      vps_status: "ready",
      agent_status: "running",
    })
    .eq("user_id", userId)

  if (error) {
    console.error("[provisioning-webhook] DB error:", error)
    return NextResponse.json({ error: "DB error" }, { status: 500 })
  }

  console.log(`[provisioning-webhook] VPS ready for user=${userId} ip=${ip}`)
  return NextResponse.json({ ok: true })
}
