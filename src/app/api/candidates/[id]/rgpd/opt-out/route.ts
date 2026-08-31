/**
 * POST /api/candidates/[id]/rgpd/opt-out
 *
 * Droit d'opposition (article 21) : trace qu'un candidat ne veut plus être
 * contacté par ce cabinet.
 *
 * ⚠️ LIMITE CONNUE, à corriger dès que le chantier Mailing sera mergé sur
 * cette branche : le produit a DÉJÀ un mécanisme d'opposition robuste
 * (liste de suppression par email+organisation, `suppressed_addresses`,
 * migration 093 sur `origin/main`), mais son code (`lib/mailing/
 * suppression.ts`) n'existe pas encore sur `formulaire_mission` — cette
 * branche est délibérément restée en arrière sur ce chantier (cf. historique
 * de la conversation). Cette route se contente donc de TRACER l'opposition
 * dans candidate_rgpd_log ; elle n'empêche encore rien techniquement (aucune
 * route d'envoi de cette branche ne vérifie une liste de suppression). Une
 * fois les deux chantiers réconciliés, brancher cette action sur
 * suppressAddress() pour qu'elle bloque réellement les envois futurs.
 */

import { NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { requireActiveAccess } from "@/lib/access-guard"
import { getAdminSupabase } from "@/lib/admin-supabase"
import { candidateRefLabel, logCandidateRgpdAction } from "@/lib/candidate-rgpd"

export const runtime = "nodejs"

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })
  const gate = await requireActiveAccess()
  if (!gate.ok) return gate.response

  const { data: candidate, error } = await sb
    .from("candidates")
    .select("id, organization_id, email")
    .eq("id", id)
    .single()
  if (error || !candidate) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }

  const admin = getAdminSupabase()
  await logCandidateRgpdAction(admin, {
    organizationId: candidate.organization_id as string,
    candidateId: candidate.id,
    candidateRef: candidateRefLabel(candidate.id),
    action: "opt_out_contact",
    actorUserId: user.id,
    detail: "Tracé uniquement — pas encore relié à une liste de suppression d'envoi (voir commentaire de la route).",
  })

  return NextResponse.json({ ok: true, enforced: false })
}
