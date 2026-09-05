/**
 * POST /api/privacy-request/[token]/delete
 *
 * Droit à l'effacement (article 17) en self-service candidat — suppression
 * IMMÉDIATE, sans validation recruteur : le jeton signé reçu par email EST
 * la vérification d'identité, une approbation humaine n'ajouterait rien et
 * retarderait l'exercice d'un droit qui doit s'exercer sans délai excessif.
 * Le recruteur est informé APRÈS coup (email), jamais consulté avant.
 *
 * POST, jamais GET : un client mail (Gmail/Outlook) qui pré-charge les liens
 * d'un email déclenche parfois des GET automatiques sans intervention
 * humaine — un GET destructeur supprimerait des candidats à leur insu.
 */

import { NextResponse } from "next/server"
import { getAdminSupabase } from "@/lib/admin-supabase"
import {
  candidateRefLabel, deleteCandidateCompletely, logCandidateRgpdAction, resolveCandidateByToken,
} from "@/lib/candidate-rgpd"
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

  // AVANT le delete : contrainte FK, candidate_id doit référencer une ligne
  // existante.
  await logCandidateRgpdAction(admin, {
    organizationId: candidate.organization_id,
    candidateId: candidate.id,
    candidateRef: ref,
    action: "delete",
    actorUserId: null,
    detail: "Demandé par le candidat via le lien self-service.",
  })

  const result = await deleteCandidateCompletely(admin, candidate)
  if (!result.ok) {
    return NextResponse.json({ error: result.message ?? "delete_failed" }, { status: 500 })
  }

  const { data: org } = await admin
    .from("organizations").select("contact_email").eq("id", candidate.organization_id).maybeSingle()
  if (org?.contact_email) {
    try {
      await sendPrivacyRequestNotification({ contactEmail: org.contact_email, candidateRef: ref, action: "delete" })
    } catch (err) {
      console.error("[privacy-request/delete] notification email failed:", err instanceof Error ? err.message : "unknown")
    }
  }

  return NextResponse.json({ ok: true })
}
