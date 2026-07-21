/**
 * PATCH /api/match/:id/pricing-params
 *   { pricing_tjm?, pricing_brut?, pricing_avantages_override? }
 *
 * Persiste les derniers réglages TJM / Brut / avantages ajustés par le
 * sourceur sur un candidat × mission précis. Au retour sur le même
 * candidat, le widget les relit pour restaurer la session — pas de
 * "sauvegarder ce scénario", le widget EST le scénario.
 *
 * Appelé en debounced (~600 ms) depuis le widget.
 *
 * Passer `pricing_avantages_override: null` réinitialise (le bouton
 * "Réinitialiser" du widget retombe alors sur les defaults cabinet).
 */

import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { requirePricingAccess } from "@/lib/access-guard"
import type { Database } from "@/lib/database.types"

export const runtime = "nodejs"

type MatchUpdate = Database["public"]["Tables"]["match_assessments"]["Update"]

function cleanInt(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const n = typeof v === "number" ? v : Number(v)
  return Number.isFinite(n) ? Math.round(n) : null
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })
  const gate = await requirePricingAccess()
  if (!gate.ok) return gate.response

  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: "bad_body" }, { status: 400 })

  // RLS-scoped read confirms ownership.
  const { data: row, error: fetchErr } = await sb
    .from("match_assessments").select("id").eq("id", id).single()
  if (fetchErr || !row) return NextResponse.json({ error: "not_found" }, { status: 404 })

  const update: MatchUpdate = {}
  if ("pricing_tjm" in body)  update.pricing_tjm  = cleanInt(body.pricing_tjm)
  if ("pricing_brut" in body) update.pricing_brut = cleanInt(body.pricing_brut)
  if ("pricing_avantages_override" in body) {
    // null wipes the override → cabinet defaults take over
    const v = body.pricing_avantages_override
    update.pricing_avantages_override = v && typeof v === "object" ? v as Record<string, unknown> : null
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: true, noop: true })
  }

  const { error: upErr } = await sb
    .from("match_assessments")
    .update(update)
    .eq("id", id)
  if (upErr) {
    console.error("[match/pricing-params] db update failed:", upErr.message)
    return NextResponse.json({ error: "db_update_failed", detail: "internal_error" }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
