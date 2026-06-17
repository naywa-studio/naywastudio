/**
 * POST /api/cabinet/reset-onboarding
 *
 * Owner-only, preview-only. Re-déclenche le flow d'onboarding cabinet
 * pour l'organisation du caller en nullifiant `cabinet_onboarded_at`.
 *
 * Pourquoi cette route existe :
 *   En attendant le chantier preview-sandbox (compte test isolé + reset
 *   complet), Elyas a besoin de pouvoir re-tester le flow d'onboarding
 *   à volonté sur les déploiements preview Vercel.
 *
 * Garde-fous :
 *   1. Bloquée hors environnement preview (VERCEL_ENV !== 'preview').
 *      Sur la prod naywastudio.com, la route renvoie 403.
 *   2. Owner-only.
 *   3. Non-destructive : on touche UNIQUEMENT à `cabinet_onboarded_at`.
 *      Aucune donnée vivier/missions/pricing n'est supprimée. À la
 *      prochaine visite de /organisation, le proxy redirige sur
 *      /onboarding ; une fois retraversé, le flag est re-stampé.
 */

import { NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { getAdminSupabase } from "@/lib/admin-supabase"

export const runtime = "nodejs"

export async function POST() {
  // Garde-fou environnement : seulement sur preview Vercel.
  if (process.env.VERCEL_ENV !== "preview") {
    return NextResponse.json(
      { error: "Réservé aux environnements preview" },
      { status: 403 },
    )
  }

  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 })
  }

  const { data: profile } = await sb
    .from("profiles")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .single()

  if (!profile?.organization_id) {
    return NextResponse.json({ error: "Pas d'organisation" }, { status: 404 })
  }
  if (profile.role !== "owner") {
    return NextResponse.json(
      { error: "Seul l'owner peut relancer l'onboarding" },
      { status: 403 },
    )
  }

  const admin = getAdminSupabase()
  const { error } = await admin
    .from("organizations")
    .update({ cabinet_onboarded_at: null })
    .eq("id", profile.organization_id)

  if (error) {
    console.error("[/api/cabinet/reset-onboarding]", error)
    return NextResponse.json({ error: "DB error" }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
