/**
 * POST /api/privacy-request/[token]/update   body: JSON
 *
 * Droit de rectification (article 16) en self-service candidat. Allowlist
 * stricte de champs (jamais de spread body — convention du projet) : un
 * candidat ne corrige que ses propres coordonnées, jamais parsed_cv,
 * taxonomy, notes internes, tags, sectors, etc.
 *
 * Pas de ré-upload de CV en V1 (un nouveau fichier ressemblerait à une
 * nouvelle candidature, plus complexe qu'une simple correction — hors
 * scope de cette slice).
 */

import { NextResponse } from "next/server"
import { getAdminSupabase } from "@/lib/admin-supabase"
import { candidateRefLabel, logCandidateRgpdAction, resolveCandidateByToken } from "@/lib/candidate-rgpd"

export const runtime = "nodejs"

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_RE = /^[0-9+()\s.-]{8,20}$/

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  const admin = getAdminSupabase()

  const candidate = await resolveCandidateByToken(admin, token)
  if (!candidate) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: "invalid_body" }, { status: 400 }) }
  const b = body as Record<string, unknown>

  const fullName = String(b.full_name ?? "").trim().slice(0, 200)
  const email = String(b.email ?? "").trim().slice(0, 200)
  const phone = String(b.phone ?? "").trim().slice(0, 40)
  const location = String(b.location ?? "").trim().slice(0, 200)
  const linkedinUrl = String(b.linkedin_url ?? "").trim().slice(0, 500)

  if (!fullName || !email || !EMAIL_RE.test(email) || !phone || !PHONE_RE.test(phone)) {
    return NextResponse.json({ error: "invalid_fields" }, { status: 400 })
  }

  const { error } = await admin
    .from("candidates")
    .update({
      full_name: fullName,
      email,
      phone,
      location: location || null,
      linkedin_url: linkedinUrl || null,
    })
    .eq("id", candidate.id)

  if (error) {
    console.error("[privacy-request/update] update failed:", error.message)
    return NextResponse.json({ error: "update_failed" }, { status: 500 })
  }

  await logCandidateRgpdAction(admin, {
    organizationId: candidate.organization_id,
    candidateId: candidate.id,
    candidateRef: candidateRefLabel(candidate.id),
    action: "rectification",
    actorUserId: null,
    detail: "Corrigé par le candidat via le lien self-service.",
  })

  return NextResponse.json({ ok: true })
}
