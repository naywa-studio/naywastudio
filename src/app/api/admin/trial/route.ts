/**
 * POST /api/admin/trial
 *
 * Admin-only. Permet de prolonger ou de réinitialiser la période d'essai
 * gratuite d'une organisation. Cas d'usage : un client demande quelques
 * jours de plus avant de souscrire, ou on lui réinitialise un trial après
 * support / retour produit.
 *
 * Body :
 *   { organization_id: string, action: "extend" | "reset", days?: number }
 *
 *   action="extend" + days=N → trial_ends_at += N jours (cap +90 par appel)
 *   action="reset"            → trial_ends_at = now() + TRIAL_DURATION_DAYS
 *
 * Audit log : action="extend_trial" ou "reset_trial" avec metadata
 * { organization_id, days?, previous_trial_ends_at }.
 */

import { NextRequest, NextResponse } from "next/server"
import { logAdminAction, requireAdmin } from "@/lib/admin"
import { getAdminSupabase } from "@/lib/admin-supabase"
import { computeTrialEndsAt } from "@/lib/trial"

export const runtime = "nodejs"

const MAX_DAYS_PER_CALL = 90

interface Body {
  organization_id?: unknown
  action?: unknown
  days?: unknown
}

export async function POST(req: NextRequest) {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.response

  const body = await req.json().catch(() => null) as Body | null
  const orgId = typeof body?.organization_id === "string" ? body.organization_id : null
  const action = body?.action === "extend" || body?.action === "reset" ? body.action : null
  if (!orgId || !action) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 })
  }

  const admin = getAdminSupabase()

  // Lit l'état actuel — sert au calcul de extend ET au journal d'audit.
  const { data: org, error: readErr } = await admin
    .from("organizations")
    .select("id, name, trial_ends_at")
    .eq("id", orgId)
    .maybeSingle()
  if (readErr || !org) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }

  let nextEndsAt: Date
  if (action === "reset") {
    nextEndsAt = computeTrialEndsAt()
  } else {
    const days = Number(body?.days)
    if (!Number.isFinite(days) || days <= 0 || days > MAX_DAYS_PER_CALL) {
      return NextResponse.json(
        { error: "bad_days", message: `days doit être > 0 et <= ${MAX_DAYS_PER_CALL}.` },
        { status: 400 },
      )
    }
    // Base = max(now, trial_ends_at actuel) : si l'essai est déjà expiré
    // ou pas encore stampé, on prolonge à partir d'aujourd'hui, sinon on
    // ajoute au-dessus de la fin existante. Évite qu'un "+7 j" sur un essai
    // expiré depuis 30 j ne donne rien.
    const current = org.trial_ends_at ? new Date(org.trial_ends_at) : null
    const base = current && current.getTime() > Date.now() ? current : new Date()
    nextEndsAt = new Date(base.getTime() + days * 24 * 60 * 60 * 1000)
  }

  const { error: updErr } = await admin
    .from("organizations")
    .update({ trial_ends_at: nextEndsAt.toISOString() })
    .eq("id", orgId)
  if (updErr) {
    console.error("[admin/trial] update failed:", updErr.message)
    return NextResponse.json({ error: "update_failed", detail: "internal_error" }, { status: 500 })
  }

  await logAdminAction({
    adminUserId: gate.userId,
    action: action === "reset" ? "reset_trial" : "extend_trial",
    targetType: "organization",
    targetId: orgId,
    metadata: {
      organization_id: orgId,
      organization_name: org.name,
      previous_trial_ends_at: org.trial_ends_at,
      next_trial_ends_at: nextEndsAt.toISOString(),
      ...(action === "extend" ? { days: Number(body?.days) } : {}),
    },
  })

  return NextResponse.json({
    ok: true,
    trial_ends_at: nextEndsAt.toISOString(),
  })
}
