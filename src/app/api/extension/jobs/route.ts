/**
 * GET /api/extension/jobs
 * Returns pending jobs for the authenticated user's Chrome extension:
 *  - type "linkedin_enrich": candidates awaiting LinkedIn profile enrichment (Nora)
 *  - type "google_search":   Google search sessions awaiting URL collection (Leo)
 *
 * Auth: Bearer token (Supabase access_token from extension).
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

export async function GET(req: NextRequest) {
  const user = await getUserFromToken(req)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // ── LinkedIn enrichment jobs (Nora) ──────────────────────────────────────────
  const { data: candidates, error: candError } = await sbAdmin
    .from("candidates")
    .select("id, linkedin_url, name_estimated, title_estimated, mission_id")
    .eq("user_id", user.id)
    .eq("source", "linkedin")
    .not("linkedin_url", "is", null)
    .or("keywords.is.null,keywords.eq.{}")
    .order("created_at", { ascending: false })
    .limit(30)

  if (candError) {
    console.error("extension/jobs candidates error:", candError)
    return NextResponse.json({ error: "Database error" }, { status: 500 })
  }

  const linkedinJobs = (candidates ?? []).map(c => ({
    type:         "linkedin_enrich" as const,
    candidate_id: c.id,
    linkedin_url: c.linkedin_url,
    name:         c.name_estimated,
    title:        c.title_estimated,
    mission_id:   c.mission_id,
  }))

  // ── Google search jobs (Leo) ─────────────────────────────────────────────────
  const { data: sessions, error: sessError } = await sbAdmin
    .from("extension_search_sessions")
    .select("id, queries, mission_id")
    .eq("user_id", user.id)
    .in("status", ["pending", "collecting"])
    .order("created_at", { ascending: true })
    .limit(5)  // max 5 sessions at once

  if (sessError) {
    console.error("extension/jobs sessions error:", sessError)
    // Don't fail — return linkedin jobs at minimum
  }

  const googleJobs = (sessions ?? []).map(s => ({
    type:       "google_search" as const,
    session_id: s.id,
    queries:    s.queries as string[],
    mission_id: s.mission_id,
  }))

  // Legacy support: keep `jobs` field pointing to linkedin_enrich for old extension versions
  return NextResponse.json({
    jobs:         linkedinJobs,   // legacy (linkedin_enrich only)
    linkedin_jobs: linkedinJobs,
    google_jobs:   googleJobs,
    total:         linkedinJobs.length + googleJobs.length,
  })
}
