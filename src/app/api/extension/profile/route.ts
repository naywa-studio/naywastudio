/**
 * POST /api/extension/profile
 * Reçoit les données enrichies d'un profil LinkedIn depuis l'extension Chrome.
 * Met à jour le candidat correspondant dans Supabase.
 * Authentification : Bearer token (Supabase access_token).
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

interface EnrichPayload {
  candidate_id?:       string
  linkedin_url:        string
  name?:               string
  title?:              string
  company?:            string
  location?:           string
  skills?:             string[]
  experience_summary?: string
  years_experience?:   number
  about?:              string
}

export async function POST(req: NextRequest) {
  const user = await getUserFromToken(req)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json() as EnrichPayload

  if (!body.linkedin_url) {
    return NextResponse.json({ error: "linkedin_url required" }, { status: 400 })
  }

  // Trouver le candidat par candidate_id ou par linkedin_url
  let candidateId = body.candidate_id
  if (!candidateId) {
    const urlNorm = body.linkedin_url.split("?")[0].replace(/\/$/, "")
    const { data } = await sbAdmin
      .from("candidates")
      .select("id")
      .eq("user_id", user.id)
      .ilike("linkedin_url", urlNorm)
      .maybeSingle()

    if (!data) {
      return NextResponse.json({ error: "Candidate not found" }, { status: 404 })
    }
    candidateId = data.id
  }

  // Construire l'objet de mise à jour — ne remplace que les champs fournis
  const update: Database["public"]["Tables"]["candidates"]["Update"] = {
    updated_at: new Date().toISOString(),
  }

  if (body.name)               update.name_estimated  = body.name
  if (body.title)              update.title_estimated = body.title
  if (body.company)            update.company         = body.company
  if (body.skills?.length)     update.keywords        = body.skills
  if (body.location) {
    // Stocker la localisation enrichie dans score_dimensions ou dans les notes
    // Pour l'instant on ne touche pas les scores existants, juste les keywords
  }

  const { error } = await sbAdmin
    .from("candidates")
    .update(update)
    .eq("id", candidateId)
    .eq("user_id", user.id)    // Sécurité : owner check

  if (error) {
    console.error("extension/profile update error:", error)
    return NextResponse.json({ error: "Database error" }, { status: 500 })
  }

  return NextResponse.json({ ok: true, candidate_id: candidateId })
}
