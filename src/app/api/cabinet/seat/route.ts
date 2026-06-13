import { NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { getAdminSupabase } from "@/lib/admin-supabase"

/**
 * POST /api/cabinet/seat  { allocate: boolean, userId?: string }
 *
 * Toggle d'un siège sourcing :
 *   - allocate=true  → has_sourcing_seat=true, donne accès au /workspace
 *   - allocate=false → has_sourcing_seat=false, libère le siège
 *
 * userId optionnel :
 *   - Absent : toggle son PROPRE siège (owner uniquement, le member
 *     ne peut pas se libérer son siège seul — il quitte l'org si
 *     besoin via l'owner).
 *   - Présent : owner-only, toggle le siège d'un membre de l'org.
 *     Permet d'allouer un siège à un member existant sans siège.
 *
 * Garde : on n'alloue jamais au-delà du budget (subscription_seats).
 */
export async function POST(req: Request) {
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })

  const { data: caller } = await sb
    .from("profiles")
    .select("role, organization_id")
    .eq("user_id", user.id)
    .single()
  if (!caller?.organization_id) {
    return NextResponse.json({ error: "Profile introuvable" }, { status: 404 })
  }

  let body: { allocate?: unknown; userId?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }
  const allocate = body.allocate === true
  const targetUserId = typeof body.userId === "string" ? body.userId : user.id

  // Si on touche un autre user, doit être owner.
  if (targetUserId !== user.id && caller.role !== "owner") {
    return NextResponse.json({ error: "Seul l'owner peut gérer les sièges des autres" }, { status: 403 })
  }
  // Self-toggle réservé à l'owner (legacy : un member ne peut pas
  // s'enlever son propre siège).
  if (targetUserId === user.id && caller.role !== "owner") {
    return NextResponse.json({ error: "Seul l'owner peut gérer son propre siège" }, { status: 403 })
  }

  const admin = getAdminSupabase()

  // La cible doit être dans la même org.
  const { data: target } = await admin
    .from("profiles")
    .select("user_id, organization_id, first_name, has_sourcing_seat")
    .eq("user_id", targetUserId)
    .single()
  if (!target || target.organization_id !== caller.organization_id) {
    return NextResponse.json({ error: "Membre introuvable" }, { status: 404 })
  }

  // Garde "ne pas dépasser le budget" : si on alloue et que le membre
  // n'a pas déjà un siège, on vérifie qu'il reste de la place.
  if (allocate && !target.has_sourcing_seat) {
    const { data: org } = await admin
      .from("organizations")
      .select("subscription_seats, seats_total")
      .eq("id", caller.organization_id)
      .single()
    const budget = org?.subscription_seats ?? org?.seats_total ?? 1

    const { count: allocatedCount } = await admin
      .from("profiles")
      .select("user_id", { count: "exact", head: true })
      .eq("organization_id", caller.organization_id)
      .eq("has_sourcing_seat", true)

    const { count: pendingInvitesCount } = await admin
      .from("org_invites")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", caller.organization_id)
      .is("accepted_at", null)

    const used = (allocatedCount ?? 0) + (pendingInvitesCount ?? 0)
    if (used >= budget) {
      return NextResponse.json(
        { error: `Budget de sièges atteint (${budget}). Souscrivez à un plan supérieur ou libérez un siège.` },
        { status: 409 },
      )
    }
  }

  const { error: updateErr } = await admin
    .from("profiles")
    .update({ has_sourcing_seat: allocate })
    .eq("user_id", targetUserId)

  if (updateErr) {
    console.error("[/api/cabinet/seat]", updateErr)
    return NextResponse.json({ error: "DB error" }, { status: 500 })
  }
  return NextResponse.json({ ok: true, has_sourcing_seat: allocate, target: targetUserId })
}
