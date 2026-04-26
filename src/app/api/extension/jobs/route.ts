/**
 * GET /api/extension/jobs
 * Retourne les candidats en attente d'enrichissement pour l'utilisateur authentifié.
 * Authentification : Bearer token (Supabase access_token passé par l'extension Chrome).
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

  // Candidats sans enrichissement : keywords vide ou null
  // L'extension Chrome (Nora N2+) peut enrichir tous les candidats linkedin
  const { data: candidates, error } = await sbAdmin
    .from("candidates")
    .select("id, linkedin_url, name_estimated, title_estimated, mission_id")
    .eq("user_id", user.id)
    .eq("source", "linkedin")
    .not("linkedin_url", "is", null)
    .or("keywords.is.null,keywords.eq.{}")
    .order("created_at", { ascending: false })
    .limit(30)

  if (error) {
    console.error("extension/jobs error:", error)
    return NextResponse.json({ error: "Database error" }, { status: 500 })
  }

  const jobs = (candidates ?? []).map(c => ({
    candidate_id:  c.id,
    linkedin_url:  c.linkedin_url,
    name:          c.name_estimated,
    title:         c.title_estimated,
    mission_id:    c.mission_id,
  }))

  return NextResponse.json({ jobs, total: jobs.length })
}
