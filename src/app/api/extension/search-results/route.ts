/**
 * POST /api/extension/search-results
 * The Chrome extension posts LinkedIn URLs found on Google results pages.
 * Auth: Bearer token (Supabase user session from extension).
 * Body: {
 *   session_id: string,
 *   results: Array<{ linkedin_url: string, display_title: string, snippet: string }>
 * }
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/database.types"

const sbAdmin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function getUserFromToken(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? ""
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : ""
  if (!token) return null
  const { data: { user }, error } = await sbAdmin.auth.getUser(token)
  if (error || !user) return null
  return user
}

interface SearchResult {
  linkedin_url:  string
  display_title: string
  snippet:       string
}

export async function POST(req: NextRequest) {
  const user = await getUserFromToken(req)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json() as {
    session_id: string
    results:    SearchResult[]
  }

  if (!body.session_id || !Array.isArray(body.results)) {
    return NextResponse.json({ error: "session_id and results required" }, { status: 400 })
  }

  // Verify session belongs to this user
  const { data: session, error: fetchError } = await sbAdmin
    .from("extension_search_sessions")
    .select("id, status, results")
    .eq("id", body.session_id)
    .eq("user_id", user.id)
    .single()

  if (fetchError || !session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 })
  }

  if (session.status === "timeout") {
    return NextResponse.json({ error: "Session expired" }, { status: 410 })
  }

  // Merge existing results with new ones, deduplicate by linkedin_url
  const existing = (session.results as SearchResult[]) ?? []
  const existingUrls = new Set(existing.map(r => normalizeUrl(r.linkedin_url)))

  const newResults = body.results.filter(r =>
    r.linkedin_url &&
    r.linkedin_url.includes("linkedin.com/in/") &&
    !existingUrls.has(normalizeUrl(r.linkedin_url))
  )

  const merged = [...existing, ...newResults]

  const { error: updateError } = await sbAdmin
    .from("extension_search_sessions")
    .update({
      results:    merged,
      status:     "collecting",
      updated_at: new Date().toISOString(),
    })
    .eq("id", body.session_id)

  if (updateError) {
    console.error("[search-results] update error:", updateError)
    return NextResponse.json({ error: "Database error" }, { status: 500 })
  }

  console.log(`[search-results] Session ${body.session_id}: +${newResults.length} URLs (total: ${merged.length})`)
  return NextResponse.json({ ok: true, added: newResults.length, total: merged.length })
}

// ── Mark session as ready ─────────────────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  const user = await getUserFromToken(req)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json() as { session_id: string }
  if (!body.session_id) return NextResponse.json({ error: "session_id required" }, { status: 400 })

  const { error } = await sbAdmin
    .from("extension_search_sessions")
    .update({ status: "ready", updated_at: new Date().toISOString() })
    .eq("id", body.session_id)
    .eq("user_id", user.id)

  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 })

  return NextResponse.json({ ok: true })
}

function normalizeUrl(url: string): string {
  return url.split("?")[0].replace(/\/$/, "").toLowerCase()
}
