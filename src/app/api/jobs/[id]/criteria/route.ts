/**
 * PATCH /api/jobs/:id/criteria   body: { criteria: Criterion[] }
 *
 * Persiste la sélection de critères choisie par le sourceur, stamp
 * criteria_locked_at = now(). Idempotent : repasser un PATCH met juste
 * à jour la liste et bump le timestamp.
 *
 * Sécurité :
 *   - Auth + ownership via RLS-scoped read.
 *   - Normalisation/sanitize via normalizeCriterion + cap dur 5+5.
 *   - Pas de spread { ...body } : seul `criteria` est accepté.
 */

import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { getAdminSupabase } from "@/lib/admin-supabase"
import {
  capCriteria,
  normalizeCriterion,
  type Criterion,
} from "@/lib/job-criteria-catalog"

export const runtime = "nodejs"

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })

  const body = await req.json().catch(() => null) as { criteria?: unknown } | null
  if (!body || !Array.isArray(body.criteria)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 })
  }

  // RLS-scoped ownership check.
  const { data: jobRow } = await sb.from("jobs").select("id").eq("id", id).maybeSingle()
  if (!jobRow) return NextResponse.json({ error: "not_found" }, { status: 404 })

  const normalized: Criterion[] = []
  for (const item of body.criteria) {
    const c = normalizeCriterion(item)
    if (c) normalized.push(c)
  }
  const finalCriteria = capCriteria(normalized)

  const admin = getAdminSupabase()
  const { error } = await admin
    .from("jobs")
    .update({
      criteria: finalCriteria,
      criteria_locked_at: new Date().toISOString(),
    })
    .eq("id", id)
  if (error) {
    return NextResponse.json({ error: "update_failed", detail: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, criteria: finalCriteria })
}
