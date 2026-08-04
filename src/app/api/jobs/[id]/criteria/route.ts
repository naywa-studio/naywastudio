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
import { requireActiveAccess } from "@/lib/access-guard"
import { getAdminSupabase } from "@/lib/admin-supabase"
import {
  capCriteria,
  normalizeCriterion,
  type Criterion,
  type CriteriaAdjustment,
} from "@/lib/job-criteria-catalog"

export const runtime = "nodejs"

/** Sanitize l'entrée d'historique (réajustement Nora appliqué). Le client
 *  fournit summary + changes + source (+ instruction pour un ajustement
 *  manuel) issus de la proposition ; on borne longueurs et cardinalité, le
 *  timestamp est posé serveur. Retourne null si vide. */
function sanitizeAdjustment(raw: unknown): CriteriaAdjustment | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  const summary = typeof r.summary === "string" ? r.summary.trim().slice(0, 400) : ""
  const changes = Array.isArray(r.changes)
    ? r.changes.filter((c): c is string => typeof c === "string").map((c) => c.trim().slice(0, 160)).filter(Boolean).slice(0, 8)
    : []
  if (!summary && changes.length === 0) return null
  const source: "feedback" | "general" = r.source === "general" ? "general" : "feedback"
  const instruction = typeof r.instruction === "string" ? r.instruction.trim().slice(0, 600) : ""
  return {
    at: new Date().toISOString(),
    summary,
    changes,
    source,
    ...(source === "general" && instruction ? { instruction } : {}),
  }
}

/** Valide un ISO timestamp fourni par le client (filigrane feedback). */
function sanitizeIso(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const t = new Date(raw).getTime()
  return Number.isFinite(t) ? new Date(t).toISOString() : null
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })
  const gate = await requireActiveAccess()
  if (!gate.ok) return gate.response

  const body = await req.json().catch(() => null) as {
    criteria?: unknown; adjustment?: unknown; feedback_watermark?: unknown
  } | null
  if (!body || !Array.isArray(body.criteria)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 })
  }

  // RLS-scoped ownership check + lecture de l'historique existant (pour append).
  const { data: jobRow } = await sb
    .from("jobs")
    .select("id, criteria_adjustments, feedback_consumed_until")
    .eq("id", id)
    .maybeSingle()
  if (!jobRow) return NextResponse.json({ error: "not_found" }, { status: 404 })

  const normalized: Criterion[] = []
  for (const item of body.criteria) {
    const c = normalizeCriterion(item)
    if (c) normalized.push(c)
  }
  const finalCriteria = capCriteria(normalized)

  // Réajustement Nora appliqué → append à l'historique (affiché sous le brief).
  const adjustment = sanitizeAdjustment(body.adjustment)
  const update: {
    criteria: Criterion[]
    criteria_locked_at: string
    criteria_adjustments?: CriteriaAdjustment[]
    feedback_consumed_until?: string | null
    pending_adjustment?: null
  } = {
    criteria: finalCriteria,
    criteria_locked_at: new Date().toISOString(),
  }
  if (adjustment) {
    const prev = Array.isArray(jobRow.criteria_adjustments) ? jobRow.criteria_adjustments : []
    // Cap dur à 20 entrées (on garde les plus récentes).
    update.criteria_adjustments = [...prev, adjustment].slice(-20)
    // Appliquer un ajustement solde la proposition en attente.
    update.pending_adjustment = null
  }
  // Filigrane feedback : avance-le quand le client applique (ou « écarte ») un
  // ajustement issu de retours client, pour que Nora ne re-propose plus ces
  // retours-là. On ne recule jamais (max avec l'existant). Fourni tel quel par
  // le client (capturé à la génération → pas de perte si un retour arrive après).
  const watermark = sanitizeIso(body.feedback_watermark)
  if (watermark) {
    const prevMs = jobRow.feedback_consumed_until ? new Date(jobRow.feedback_consumed_until).getTime() : 0
    if (new Date(watermark).getTime() > prevMs) update.feedback_consumed_until = watermark
  }

  const admin = getAdminSupabase()
  const { error } = await admin
    .from("jobs")
    .update(update)
    .eq("id", id)
  if (error) {
    console.error("[jobs/:id/criteria] update failed:", error.message)
    return NextResponse.json({ error: "update_failed", detail: "internal_error" }, { status: 500 })
  }

  return NextResponse.json({ ok: true, criteria: finalCriteria })
}
