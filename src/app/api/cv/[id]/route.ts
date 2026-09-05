/**
 * DELETE /api/cv/:id  — remove a candidate (DB row + R2 objects).
 *
 * Wrapper authentifié autour de lib/candidate-rgpd.ts::deleteCandidateCompletely
 * (extrait en Slice 6.2 pour être réutilisé par la route de suppression
 * self-service candidat, /api/privacy-request/[token]/delete).
 */

import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { requireActiveAccess } from "@/lib/access-guard"
import { getAdminSupabase } from "@/lib/admin-supabase"
import { candidateRefLabel, deleteCandidateCompletely, logCandidateRgpdAction } from "@/lib/candidate-rgpd"

export const runtime = "nodejs"

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })
  const gate = await requireActiveAccess()
  if (!gate.ok) return gate.response

  // Verify access via user-scoped client. RLS is org-scoped (migration
  // 019), so a returned row proves the caller is in the same org as
  // the candidate — which is the required permission.
  const { data: candidate, error: fetchErr } = await sb
    .from("candidates")
    .select("id, organization_id, cv_file_path")
    .eq("id", id)
    .single()

  if (fetchErr || !candidate) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }

  const admin = getAdminSupabase()
  const orgId = candidate.organization_id

  // AVANT le delete : candidate_id référence encore une ligne existante
  // (contrainte FK) — logger après échouerait, la ligne n'existant plus.
  if (orgId) {
    await logCandidateRgpdAction(admin, {
      organizationId: orgId,
      candidateId: candidate.id,
      candidateRef: candidateRefLabel(candidate.id),
      action: "delete",
      actorUserId: user.id,
    })
  }

  const result = await deleteCandidateCompletely(admin, candidate)
  if (!result.ok) {
    return NextResponse.json({ error: result.message ?? "db_delete_failed" }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
