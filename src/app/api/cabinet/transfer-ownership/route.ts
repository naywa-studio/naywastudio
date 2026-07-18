import { NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { getAdminSupabase } from "@/lib/admin-supabase"

export const runtime = "nodejs"

/**
 * POST /api/cabinet/transfer-ownership   { user_id }
 *
 * Owner-only. Transfère la propriété de l'organisation à un autre membre.
 *   - le membre cible doit appartenir à la même org et ne pas être l'owner ;
 *   - l'owner sortant devient `member`, la cible devient `owner` ;
 *   - `organizations.owner_user_id` pointe désormais sur la cible.
 *
 * Débloque le cul-de-sac historique (owner sans successeur) : un owner peut
 * passer la main au lieu de supprimer l'organisation. Les sièges / accès ne
 * sont pas touchés — la cible garde son siège si elle en avait un ; sinon
 * elle devient owner sans siège (admin pur du cabinet), comme prévu au modèle.
 */

interface Body {
  user_id?: string
}

export async function POST(req: Request) {
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
    return NextResponse.json({ error: "Only the owner can transfer ownership" }, { status: 403 })
  }

  let body: Body
  try { body = (await req.json()) as Body }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

  const targetId = typeof body.user_id === "string" ? body.user_id.trim() : ""
  if (!targetId) return NextResponse.json({ error: "Missing user_id" }, { status: 400 })
  if (targetId === user.id) {
    return NextResponse.json({ error: "Already the owner" }, { status: 400 })
  }

  const admin = getAdminSupabase()

  // La cible doit être un membre de la même org.
  const { data: target } = await admin
    .from("profiles")
    .select("user_id, organization_id, role")
    .eq("user_id", targetId)
    .single()
  if (!target || target.organization_id !== profile.organization_id) {
    return NextResponse.json({ error: "Target is not a member of this organization" }, { status: 400 })
  }

  // Promotion cible → owner.
  const { error: promoteErr } = await admin
    .from("profiles")
    .update({ role: "owner" })
    .eq("user_id", targetId)
  if (promoteErr) {
    console.error("[/api/cabinet/transfer-ownership] promote", promoteErr)
    return NextResponse.json({ error: "DB error" }, { status: 500 })
  }

  // Rétrogradation owner sortant → member.
  const { error: demoteErr } = await admin
    .from("profiles")
    .update({ role: "member" })
    .eq("user_id", user.id)
  if (demoteErr) {
    console.error("[/api/cabinet/transfer-ownership] demote", demoteErr)
    // Best-effort rollback de la promotion pour ne pas laisser 2 owners.
    await admin.from("profiles").update({ role: "member" }).eq("user_id", targetId)
    return NextResponse.json({ error: "DB error" }, { status: 500 })
  }

  // Pointeur owner_user_id sur la nouvelle propriété.
  const { error: orgErr } = await admin
    .from("organizations")
    .update({ owner_user_id: targetId })
    .eq("id", profile.organization_id)
  if (orgErr) {
    console.error("[/api/cabinet/transfer-ownership] org pointer", orgErr)
    return NextResponse.json({ error: "DB error" }, { status: 500 })
  }

  return NextResponse.json({ ok: true, new_owner_user_id: targetId })
}
