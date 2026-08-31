/**
 * POST /api/candidates/[id]/rgpd/anonymize
 *
 * Anonymisation RGPD (droit d'effacement partiel, article 17) : vide les
 * données identifiantes du candidat et purge ses fichiers R2, MAIS garde la
 * ligne — utile quand le sourceur veut respecter une demande de suppression
 * sans perdre la trace statistique du candidat dans le vivier (séniorité,
 * secteurs, compétences...). Pour une suppression totale, voir
 * `DELETE /api/cv/[id]` (Slice 2, action "Supprimer définitivement").
 *
 * ⚠️ Sans rapport avec l'anonymisation PRODUIT (`anonymized_pdf_path` /
 * `anonymized_at`) qui génère un CV présentable à un client — deux features
 * différentes qui partagent malheureusement le même mot.
 */

import { NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { requireActiveAccess } from "@/lib/access-guard"
import { getAdminSupabase } from "@/lib/admin-supabase"
import { candidateRefLabel, logCandidateRgpdAction, scrubCandidatePii } from "@/lib/candidate-rgpd"

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
    .select("id, organization_id, cv_file_path")
    .eq("id", id)
    .single()
  if (error || !candidate) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }

  const admin = getAdminSupabase()
  const ref = candidateRefLabel(candidate.id)

  const result = await scrubCandidatePii(admin, {
    id: candidate.id,
    organization_id: candidate.organization_id as string,
    cv_file_path: candidate.cv_file_path as string | null,
  })
  if (!result.ok) {
    return NextResponse.json({ error: result.message ?? "anonymize_failed" }, { status: 500 })
  }

  // Detail volontairement générique — jamais de PII dans le log, ça
  // annulerait le point même de l'anonymisation.
  await logCandidateRgpdAction(admin, {
    organizationId: candidate.organization_id as string,
    candidateId: candidate.id,
    candidateRef: ref,
    action: "anonymize",
    actorUserId: user.id,
  })

  return NextResponse.json({ ok: true })
}
