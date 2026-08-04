/**
 * POST /api/jobs/:id/feedback-dismiss   (lot 3c v3/v4)
 *
 * Abandonne la proposition Nora EN ATTENTE (efface `pending_adjustment`) et,
 * si un `watermark` est fourni (retours client sans changement recommandé),
 * avance le filigrane `feedback_consumed_until` pour ne plus re-proposer ces
 * retours. Ne touche JAMAIS aux critères (pas de re-matching, pas de fausse
 * bannière « critères modifiés »). Sert les 2 boutons « Ignorer » et « OK, ne
 * plus me le proposer ».
 */

import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { requireActiveAccess } from "@/lib/access-guard"
import { getAdminSupabase } from "@/lib/admin-supabase"

export const runtime = "nodejs"

function sanitizeIso(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const t = new Date(raw).getTime()
  return Number.isFinite(t) ? new Date(t).toISOString() : null
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })
  const gate = await requireActiveAccess()
  if (!gate.ok) return gate.response

  const body = await req.json().catch(() => null) as { watermark?: unknown } | null
  const watermark = sanitizeIso(body?.watermark)

  // RLS-scoped ownership + filigrane courant (ne jamais reculer).
  const { data: jobRow } = await sb
    .from("jobs")
    .select("id, feedback_consumed_until")
    .eq("id", id)
    .maybeSingle()
  if (!jobRow) return NextResponse.json({ error: "not_found" }, { status: 404 })

  // Toujours effacer la proposition en attente. Avancer le filigrane seulement
  // si le watermark fourni est plus récent que l'existant.
  const update: { pending_adjustment: null; feedback_consumed_until?: string } = { pending_adjustment: null }
  const prevMs = jobRow.feedback_consumed_until ? new Date(jobRow.feedback_consumed_until).getTime() : 0
  if (watermark && new Date(watermark).getTime() > prevMs) {
    update.feedback_consumed_until = watermark
  }

  const admin = getAdminSupabase()
  const { error } = await admin.from("jobs").update(update).eq("id", id)
  if (error) {
    console.error("[jobs/:id/feedback-dismiss] update failed:", error.message)
    return NextResponse.json({ error: "update_failed", detail: "internal_error" }, { status: 500 })
  }
  return NextResponse.json({ ok: true, feedback_consumed_until: update.feedback_consumed_until ?? jobRow.feedback_consumed_until })
}
