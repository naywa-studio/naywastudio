/**
 * POST /api/cabinet/onboarding-done
 *
 * Marks the cabinet onboarding flow as completed. Stamps
 * `cabinet_onboarded_at = now()` (idempotent — repeated calls leave the
 * existing timestamp untouched).
 *
 * Owner-only. The body optionally carries a `cabinetName` so we update
 * the org name in the same write rather than chaining two requests
 * from the client.
 */

import { NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { getAdminSupabase } from "@/lib/admin-supabase"

export const runtime = "nodejs"

interface OnboardingBody {
  cabinetName?: string
}

export async function POST(req: Request) {
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 })
  }

  const { data: profile, error: profileErr } = await sb
    .from("profiles")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .single()

  if (profileErr || !profile?.organization_id) {
    return NextResponse.json({ error: "Profil introuvable" }, { status: 404 })
  }
  if (profile.role !== "owner") {
    return NextResponse.json(
      { error: "Seul l'owner peut compléter l'onboarding" },
      { status: 403 },
    )
  }

  let body: OnboardingBody = {}
  try {
    body = (await req.json()) as OnboardingBody
  } catch {
    /* no body is fine */
  }

  const trimmedName = (body.cabinetName ?? "").trim()
  const cabinetName = trimmedName.slice(0, 120)

  // Read existing onboarded_at so we don't overwrite the original
  // completion stamp.
  const { data: org } = await sb
    .from("organizations")
    .select("cabinet_onboarded_at")
    .eq("id", profile.organization_id)
    .single()

  const updatePayload: {
    cabinet_onboarded_at?: string
    branding_locked_at?: string
    name?: string
  } = {}
  if (!org?.cabinet_onboarded_at) {
    const nowIso = new Date().toISOString()
    updatePayload.cabinet_onboarded_at = nowIso
    // Fenêtre de grâce 24h : après ce délai, logo + nom + email-contact
    // basculent en read-only. La modification passe par une demande
    // validée par un admin Naywa (cf. /admin/demandes).
    updatePayload.branding_locked_at = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  }
  if (cabinetName) {
    updatePayload.name = cabinetName
  }

  if (Object.keys(updatePayload).length === 0) {
    return NextResponse.json({ ok: true, alreadyDone: true })
  }

  const admin = getAdminSupabase()
  const { error: updateErr } = await admin
    .from("organizations")
    .update(updatePayload)
    .eq("id", profile.organization_id)

  if (updateErr) {
    console.error("[onboarding-done] update failed", updateErr)
    return NextResponse.json(
      { error: "Sauvegarde impossible pour le moment" },
      { status: 500 },
    )
  }

  return NextResponse.json({ ok: true })
}
