/**
 * GET /api/privacy-request/[token]/export
 *
 * Droit d'accès (article 15) en self-service candidat — variante sans
 * session de GET /api/candidates/[id]/rgpd/export (Slice 2), déclenchée par
 * le jeton signé reçu par email plutôt que par une session recruteur.
 *
 * GET volontaire (lecture seule, non destructif) — même choix que la route
 * recruteur équivalente.
 */

import { NextResponse } from "next/server"
import { getAdminSupabase } from "@/lib/admin-supabase"
import { candidateRefLabel, logCandidateRgpdAction, resolveCandidateByToken } from "@/lib/candidate-rgpd"

export const runtime = "nodejs"

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  const admin = getAdminSupabase()

  const candidate = await resolveCandidateByToken(admin, token)
  if (!candidate) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }

  const ref = candidateRefLabel(candidate.id)
  const exportPayload = {
    meta: {
      generated_at: new Date().toISOString(),
      generator: "naywa-studio candidate export v1 (self-service)",
      candidate_ref: ref,
      disclaimer:
        "Cet export contient l'ensemble des données détenues sur vous à la date de génération " +
        "(droit d'accès RGPD, article 15). Conservez ce fichier comme archive.",
    },
    candidate,
  }

  await logCandidateRgpdAction(admin, {
    organizationId: candidate.organization_id,
    candidateId: candidate.id,
    candidateRef: ref,
    action: "export",
    actorUserId: null,
    detail: "Demandé par le candidat via le lien self-service.",
  })

  const json = JSON.stringify(exportPayload, null, 2)
  return new NextResponse(json, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="mes-donnees-${ref}.json"`,
    },
  })
}
