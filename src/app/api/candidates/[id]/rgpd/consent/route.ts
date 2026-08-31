/**
 * POST /api/candidates/[id]/rgpd/consent   body: { consent: boolean }
 *
 * Consentement vivier — DÉCLARATIF (pas de formulaire candidat public
 * aujourd'hui, cf. CLAUDE.md) : le sourceur déclare avoir obtenu l'accord du
 * candidat pour une conservation prolongée (2 ans au lieu de 180 jours par
 * défaut — voir migrations 098/099/100 pour le calcul de retention_until).
 *
 * L'UPDATE déclenche le trigger `recompute_candidate_retention_on_consent_
 * change` (098) qui recalcule `retention_until` automatiquement — cette
 * route n'a pas à faire ce calcul elle-même.
 *
 * Passe par une route serveur (plutôt qu'une écriture directe RLS comme
 * notes/tags) uniquement pour pouvoir écrire dans candidate_rgpd_log, qui
 * n'accepte aucune écriture authenticated par design (cf. migration 100).
 */

import { NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { requireActiveAccess } from "@/lib/access-guard"
import { getAdminSupabase } from "@/lib/admin-supabase"
import { candidateRefLabel, logCandidateRgpdAction } from "@/lib/candidate-rgpd"

export const runtime = "nodejs"

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })
  const gate = await requireActiveAccess()
  if (!gate.ok) return gate.response

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: "invalid_body" }, { status: 400 }) }
  const consent = (body as { consent?: unknown })?.consent
  if (typeof consent !== "boolean") {
    return NextResponse.json({ error: "consent_must_be_boolean" }, { status: 400 })
  }

  const { data: candidate, error } = await sb
    .from("candidates")
    .select("id, organization_id")
    .eq("id", id)
    .single()
  if (error || !candidate) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }

  const admin = getAdminSupabase()
  const now = new Date().toISOString()

  const { data: updated, error: updErr } = await admin
    .from("candidates")
    .update({
      talent_pool_consent: consent,
      talent_pool_consent_at: now,
      talent_pool_consent_by: user.id,
    })
    .eq("id", candidate.id)
    .select("talent_pool_consent, talent_pool_consent_at, retention_until")
    .single()

  if (updErr || !updated) {
    console.error("[rgpd/consent] update failed:", updErr?.message)
    return NextResponse.json({ error: "update_failed" }, { status: 500 })
  }

  await logCandidateRgpdAction(admin, {
    organizationId: candidate.organization_id as string,
    candidateId: candidate.id,
    candidateRef: candidateRefLabel(candidate.id),
    action: consent ? "consent_granted" : "consent_revoked",
    actorUserId: user.id,
  })

  return NextResponse.json({ ok: true, ...updated })
}
