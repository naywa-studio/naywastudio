/**
 * POST /api/cabinet/package-onboarding-done
 *
 * Owner-only. Stamp organizations.package_sourcing_onboarded_at = now().
 * Idempotent : si déjà stampé, on retourne la valeur existante.
 *
 * Appelé à la fin de la visite guidée 6 étapes (déclenchée
 * automatiquement après souscription) — ou si l'owner clique "Plus tard"
 * et fait skip définitif.
 */

import { NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { getAdminSupabase } from "@/lib/admin-supabase"

export const runtime = "nodejs"

export async function POST() {
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
      { error: "Seul l'owner peut marquer l'onboarding comme terminé" },
      { status: 403 },
    )
  }

  const admin = getAdminSupabase()
  const { data: org } = await admin
    .from("organizations")
    .select("package_sourcing_onboarded_at")
    .eq("id", profile.organization_id)
    .single()

  if (org?.package_sourcing_onboarded_at) {
    return NextResponse.json({
      onboardedAt: org.package_sourcing_onboarded_at,
      alreadyDone: true,
    })
  }

  const now = new Date().toISOString()
  const { error: updErr } = await admin
    .from("organizations")
    .update({ package_sourcing_onboarded_at: now })
    .eq("id", profile.organization_id)
  if (updErr) {
    console.error("[package-onboarding-done] update:", updErr)
    return NextResponse.json({ error: "Stamp impossible" }, { status: 500 })
  }

  return NextResponse.json({ onboardedAt: now, alreadyDone: false })
}
