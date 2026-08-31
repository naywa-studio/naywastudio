/**
 * GET /api/candidates/[id]/rgpd/export
 *
 * Droit d'accès RGPD : exporte TOUTES les données détenues sur un candidat
 * en un JSON téléchargeable. Même pattern que /api/export/me (portabilité
 * cabinet), à l'échelle d'un candidat.
 *
 * Lecture seule (GET) : pas de requireActiveAccess (convention du projet —
 * cf lib/access-guard.ts), juste auth + vérification d'appartenance via le
 * client RLS. Un cabinet en lecture seule doit pouvoir répondre à une
 * demande RGPD candidat même hors accès actif.
 */

import { NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { getAdminSupabase } from "@/lib/admin-supabase"
import { CANDIDATE_COLUMNS } from "@/lib/database.types"
import { candidateRefLabel, logCandidateRgpdAction } from "@/lib/candidate-rgpd"

export const runtime = "nodejs"

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })

  // select() via le client RLS PROUVE l'appartenance à l'org (RLS org-scopée,
  // migration 019) — une ligne renvoyée = même org que l'appelant.
  const { data: candidate, error } = await sb
    .from("candidates")
    .select(`${CANDIDATE_COLUMNS}, raw_text, organization_id`)
    .eq("id", id)
    .single()

  if (error || !candidate) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }

  const ref = candidateRefLabel(candidate.id)
  const exportPayload = {
    meta: {
      generated_at: new Date().toISOString(),
      generator: "naywa-studio candidate export v1",
      candidate_ref: ref,
      disclaimer:
        "Cet export contient l'ensemble des données détenues sur ce candidat à la date " +
        "de génération (droit d'accès RGPD, article 15). Conservez ce fichier comme archive.",
    },
    candidate,
  }

  const admin = getAdminSupabase()
  await logCandidateRgpdAction(admin, {
    organizationId: candidate.organization_id as string,
    candidateId: candidate.id,
    candidateRef: ref,
    action: "export",
    actorUserId: user.id,
  })

  const json = JSON.stringify(exportPayload, null, 2)
  return new NextResponse(json, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="naywa-candidat-${ref}.json"`,
    },
  })
}
