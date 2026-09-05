/**
 * POST /api/privacy-request/[token]/opt-out
 *
 * Droit d'opposition (article 21) en self-service candidat. Même limite
 * assumée que la variante recruteur (Slice 2) : trace l'opposition, mais ne
 * bloque encore rien techniquement — le vrai mécanisme de suppression
 * d'envoi (`suppressed_addresses`) vit dans le chantier Mailing, absent de
 * cette branche. À brancher une fois les deux réconciliés.
 */

import { NextResponse } from "next/server"
import { getAdminSupabase } from "@/lib/admin-supabase"
import { candidateRefLabel, logCandidateRgpdAction, resolveCandidateByToken } from "@/lib/candidate-rgpd"
import { sendPrivacyRequestNotification } from "@/lib/privacy-request-notify"

export const runtime = "nodejs"

export async function POST(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  const admin = getAdminSupabase()

  const candidate = await resolveCandidateByToken(admin, token)
  if (!candidate) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }

  const ref = candidateRefLabel(candidate.id)
  await logCandidateRgpdAction(admin, {
    organizationId: candidate.organization_id,
    candidateId: candidate.id,
    candidateRef: ref,
    action: "opt_out_contact",
    actorUserId: null,
    detail: "Demandé par le candidat via le lien self-service. Tracé uniquement — pas encore relié à une liste de suppression d'envoi.",
  })

  const { data: org } = await admin
    .from("organizations").select("contact_email").eq("id", candidate.organization_id).maybeSingle()
  if (org?.contact_email) {
    try {
      await sendPrivacyRequestNotification({ contactEmail: org.contact_email, candidateRef: ref, action: "opt_out_contact" })
    } catch (err) {
      console.error("[privacy-request/opt-out] notification email failed:", err instanceof Error ? err.message : "unknown")
    }
  }

  return NextResponse.json({ ok: true, enforced: false })
}
