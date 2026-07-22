import { NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { getAdminSupabase } from "@/lib/admin-supabase"

export const runtime = "nodejs"

/**
 * POST /api/cabinet/delegate-settings  { userId: string, allow: boolean }
 *
 * L'owner délègue (ou retire) à un MEMBRE le droit de gérer la
 * configuration de l'organisation : branding et politique de pricing.
 *
 * Ce que la délégation N'OUVRE PAS, et ne doit jamais ouvrir :
 *   - l'abonnement et la facturation,
 *   - l'allocation des sièges et les invitations,
 *   - le transfert de propriété,
 *   - la suppression de l'organisation.
 * Ces actions vivent sur d'autres routes, toutes gardées par `role=owner`.
 *
 * Cas d'usage d'origine : un dirigeant est owner pour la facturation mais
 * n'utilise pas l'outil ; c'est son sourceur qui doit régler les marges et
 * l'habillage des documents envoyés aux clients.
 */
export async function POST(req: Request) {
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })

  const { data: caller } = await sb
    .from("profiles")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .single()

  if (!caller?.organization_id) {
    return NextResponse.json({ error: "No organization" }, { status: 404 })
  }
  if (caller.role !== "owner") {
    return NextResponse.json(
      { error: "owner_only", message: "Seul le propriétaire peut déléguer la configuration." },
      { status: 403 },
    )
  }

  let body: { userId?: unknown; allow?: unknown }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

  const targetUserId = typeof body.userId === "string" ? body.userId : ""
  const allow = body.allow === true
  if (!targetUserId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 })
  }

  const admin = getAdminSupabase()

  // Lecture d'abord via une requête SCOPÉE à l'org de l'appelant : si la
  // cible n'y appartient pas, on renvoie 404 sans jamais révéler qu'elle
  // existe ailleurs. Même principe que sur les autres routes de mutation.
  const { data: target } = await admin
    .from("profiles")
    .select("user_id, role, first_name")
    .eq("user_id", targetUserId)
    .eq("organization_id", caller.organization_id)
    .single()

  if (!target) {
    return NextResponse.json({ error: "Membre introuvable dans cette organisation" }, { status: 404 })
  }
  // L'owner tient déjà ces droits de son rôle : le drapeau ne le concerne
  // pas, et le laisser modifiable créerait un état incohérent (un owner
  // « sans droit » de configurer sa propre organisation).
  if (target.role === "owner") {
    return NextResponse.json(
      { error: "owner_always_allowed", message: "Le propriétaire dispose déjà de ces droits." },
      { status: 400 },
    )
  }

  const { error } = await admin
    .from("profiles")
    .update({ can_manage_org_settings: allow })
    .eq("user_id", targetUserId)
    .eq("organization_id", caller.organization_id)

  if (error) {
    console.error("[/api/cabinet/delegate-settings]", error)
    return NextResponse.json({ error: "DB error" }, { status: 500 })
  }

  return NextResponse.json({ ok: true, userId: targetUserId, allow })
}
