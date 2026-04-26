/**
 * /api/extension/search-session
 *
 * POST  — Leo (VPS) creates a search session with Google queries.
 *          Auth: X-Nawa-Secret header (agent secret).
 *          Body: { user_id: string, mission_id?: string, queries: string[] }
 *          Returns: { session_id: string }
 *
 * GET   — Leo polls for results.
 *          Auth: X-Nawa-Secret header.
 *          Query: ?id={session_id}
 *          Returns: { status: "pending"|"collecting"|"ready"|"timeout", results: SearchResult[] }
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/database.types"

const sbAdmin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function checkAgentSecret(req: NextRequest): boolean {
  const secret = req.headers.get("x-nawa-secret")
  return secret === process.env.NAWA_AGENT_SECRET
}

// ── POST — Leo creates a search session ──────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!checkAgentSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json() as {
    user_id:     string
    mission_id?: string
    queries:     string[]
  }

  if (!body.user_id || !Array.isArray(body.queries) || body.queries.length === 0) {
    return NextResponse.json({ error: "user_id and queries required" }, { status: 400 })
  }

  // Cancel any stale pending sessions for this user (cleanup)
  await sbAdmin
    .from("extension_search_sessions")
    .update({ status: "timeout" })
    .eq("user_id", body.user_id)
    .eq("status", "pending")
    .lt("created_at", new Date(Date.now() - 10 * 60 * 1000).toISOString()) // older than 10min

  const { data, error } = await sbAdmin
    .from("extension_search_sessions")
    .insert({
      user_id:    body.user_id,
      mission_id: body.mission_id ?? null,
      queries:    body.queries,
      results:    [],
      status:     "pending",
    })
    .select("id")
    .single()

  if (error || !data) {
    console.error("[search-session] insert error:", error)
    return NextResponse.json({ error: "Database error" }, { status: 500 })
  }

  console.log(`[search-session] Created session ${data.id} for user ${body.user_id} — ${body.queries.length} queries`)
  return NextResponse.json({ session_id: data.id })
}

// ── GET — Leo polls for results ───────────────────────────────────────────────

export async function GET(req: NextRequest) {
  if (!checkAgentSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const sessionId = req.nextUrl.searchParams.get("id")
  if (!sessionId) {
    return NextResponse.json({ error: "id required" }, { status: 400 })
  }

  const { data, error } = await sbAdmin
    .from("extension_search_sessions")
    .select("status, results, created_at")
    .eq("id", sessionId)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 })
  }

  // Auto-timeout: sessions older than 8 minutes are considered dead
  const age = Date.now() - new Date(data.created_at).getTime()
  if (data.status === "pending" || data.status === "collecting") {
    if (age > 8 * 60 * 1000) {
      await sbAdmin
        .from("extension_search_sessions")
        .update({ status: "timeout" })
        .eq("id", sessionId)

      return NextResponse.json({ status: "timeout", results: data.results ?? [] })
    }
  }

  return NextResponse.json({
    status:  data.status,
    results: data.results ?? [],
  })
}
