import { NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { getAdminSupabase } from "@/lib/admin-supabase"

export const runtime = "nodejs"

/**
 * POST /api/cabinet/cancel-deletion
 *
 * Owner-only. Annule une suppression programmée (clear `pending_deletion_at`).
 * L'organisation repasse dans son état d'accès normal (essai / abonnement /
 * grâce d'abonnement selon le cas). Idempotent : sans suppression en cours,
 * renvoie ok sans rien changer.
 *
 * Réservé à l'owner car lui seul peut demander la suppression — et il conserve
 * son profil owner pendant toute la grâce (on ne détruit plus l'owner).
 */
export async function POST() {
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })

  const { data: profile } = await sb
    .from("profiles")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .single()

  if (!profile?.organization_id) {
    return NextResponse.json({ error: "No organization" }, { status: 404 })
  }
  if (profile.role !== "owner") {
    return NextResponse.json({ error: "Only the owner can cancel deletion" }, { status: 403 })
  }

  const admin = getAdminSupabase()
  const { error } = await admin
    .from("organizations")
    .update({ pending_deletion_at: null })
    .eq("id", profile.organization_id)

  if (error) {
    console.error("[/api/cabinet/cancel-deletion]", error)
    return NextResponse.json({ error: "DB error" }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
