/**
 * POST /api/cabinet/package-onboarding-done
 *
 * Stamp profiles.package_sourcing_onboarded_at = now() pour l'utilisateur
 * courant (owner OU member). Idempotent : si déjà stampé, retourne la
 * valeur existante.
 *
 * Migration 038 : flag passé au niveau profile pour que chaque membre
 * voie sa propre visite guidée la première fois qu'il atterrit sur
 * /workspace, indépendamment de ce qu'a fait l'owner.
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

  const admin = getAdminSupabase()
  const { data: profile } = await admin
    .from("profiles")
    .select("package_sourcing_onboarded_at")
    .eq("user_id", user.id)
    .single()

  if (profile?.package_sourcing_onboarded_at) {
    return NextResponse.json({
      onboardedAt: profile.package_sourcing_onboarded_at,
      alreadyDone: true,
    })
  }

  const now = new Date().toISOString()
  const { error: updErr } = await admin
    .from("profiles")
    .update({ package_sourcing_onboarded_at: now })
    .eq("user_id", user.id)
  if (updErr) {
    console.error("[package-onboarding-done] update:", updErr)
    return NextResponse.json({ error: "Stamp impossible" }, { status: 500 })
  }

  return NextResponse.json({ onboardedAt: now, alreadyDone: false })
}
