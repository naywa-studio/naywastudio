/**
 * POST /api/cv/:id/parse
 *
 * Background-style parse step. The candidate row + PDF are already stored
 * by /api/cv/upload — this route verifies ownership, then delegates the
 * actual work to lib/candidate-parse.ts (extracted in Slice 6.1 so the
 * public application route can call the exact same logic without an
 * authenticated session).
 *
 * The client fires this fire-and-forget; the vivier UI re-renders via
 * Realtime when parse_status flips to "parsed" or "error". A "Relancer
 * le parsing" button on the candidate page also POSTs here.
 */

import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { requireActiveAccess } from "@/lib/access-guard"
import { getAdminSupabase } from "@/lib/admin-supabase"
import { parseCandidateCv } from "@/lib/candidate-parse"

export const runtime = "nodejs"
// pdf-parse + LLM parse + classification secteur (bornée 10 s). 90 s laisse
// de la marge pour l'enchaînement parse (≤ watchdog) + classify.
export const maxDuration = 90

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params

  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })
  const gate = await requireActiveAccess()
  if (!gate.ok) return gate.response

  // Verify ownership via RLS-scoped client.
  const { data: candidate, error: fetchErr } = await sb
    .from("candidates")
    .select("id, user_id, organization_id, cv_file_path, parse_status, tags, taxonomy")
    .eq("id", id)
    .single()
  if (fetchErr || !candidate) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }
  if (!candidate.cv_file_path) {
    return NextResponse.json({ error: "no_file" }, { status: 400 })
  }

  const admin = getAdminSupabase()
  const outcome = await parseCandidateCv(admin, {
    id: candidate.id,
    user_id: candidate.user_id,
    organization_id: candidate.organization_id,
    cv_file_path: candidate.cv_file_path,
    tags: candidate.tags,
    taxonomy: candidate.taxonomy,
  })

  switch (outcome.kind) {
    case "timeout":
      return NextResponse.json({
        ok: false, error: "parse_timeout",
        message: "Parsing trop long, réessayez.",
      }, { status: 200 })
    case "download_failed":
      return NextResponse.json({ error: "download_failed" }, { status: 500 })
    case "parse_error":
      return NextResponse.json({
        ok: false, error: outcome.code, message: outcome.message,
      }, { status: 200 })
    case "db_update_failed":
      return NextResponse.json({ error: "db_update_failed", detail: "internal_error" }, { status: 500 })
    case "success":
      // Plus d'auto-matching à l'ajout d'un CV (retour Elyas) : le scoring ne
      // part que sur action explicite du sourceur, ou via score-one pour
      // E1/E2. Comportement inchangé.
      return NextResponse.json({ ok: true, candidate: outcome.candidate, has_doublon: outcome.hasDoublon })
  }
}
