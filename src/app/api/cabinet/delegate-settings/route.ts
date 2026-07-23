import { NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { getAdminSupabase } from "@/lib/admin-supabase"

export const runtime = "nodejs"

/**
 * POST /api/cabinet/delegate-settings
 *   { userId: string, branding?: boolean, pricing?: boolean }
 *
 * L'owner accorde (ou retire) à un MEMBRE des capacités de gestion de son
 * organisation, À LA CARTE. Chaque cap fournie dans le body est mise à jour ;
 * les caps absentes sont laissées telles quelles.
 *   - branding : identité & image (logo, couleurs, slogan, email de contact)
 *   - pricing  : politique commerciale (marges, jours facturables, défauts TJM)
 *
 * Ce que la délégation N'OUVRE JAMAIS, quelle que soit la cap accordée :
 *   - l'abonnement et la facturation,
 *   - l'achat/réduction de sièges payés,
 *   - le transfert de propriété, la suppression de l'organisation,
 *   - l'OCTROI de capacités (cette route elle-même) — sinon un délégué
 *     pourrait s'auto-promouvoir : c'est la vanne d'escalade, owner strict.
 * Ces actions vivent sur d'autres routes, toutes gardées owner.
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
  // Octroi de capacités = owner STRICT. Ni délégué, ni membre : c'est la vanne
  // d'escalade de privilèges, elle ne se délègue pas.
  if (caller.role !== "owner") {
    return NextResponse.json(
      { error: "owner_only", message: "Seul le propriétaire peut déléguer des accès." },
      { status: 403 },
    )
  }

  let body: { userId?: unknown; branding?: unknown; pricing?: unknown }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

  const targetUserId = typeof body.userId === "string" ? body.userId : ""
  if (!targetUserId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 })
  }

  // On ne met à jour QUE les caps explicitement présentes dans le body (bool).
  // Une cap absente n'est pas touchée — permet des toggles indépendants.
  const patch: { can_manage_branding?: boolean; can_manage_pricing?: boolean } = {}
  if (typeof body.branding === "boolean") patch.can_manage_branding = body.branding
  if (typeof body.pricing === "boolean") patch.can_manage_pricing = body.pricing
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "no_caps", message: "Aucune capacité à modifier." }, { status: 400 })
  }

  const admin = getAdminSupabase()

  // Lecture d'abord via une requête SCOPÉE à l'org de l'appelant : si la cible
  // n'y appartient pas, on renvoie 404 sans jamais révéler qu'elle existe
  // ailleurs. Même principe que sur les autres routes de mutation.
  const { data: target } = await admin
    .from("profiles")
    .select("user_id, role")
    .eq("user_id", targetUserId)
    .eq("organization_id", caller.organization_id)
    .single()

  if (!target) {
    return NextResponse.json({ error: "Membre introuvable dans cette organisation" }, { status: 404 })
  }
  // L'owner tient déjà ces droits de son rôle : les caps ne le concernent pas,
  // et les rendre modifiables créerait un état incohérent (un owner « sans
  // droit » de configurer sa propre organisation).
  if (target.role === "owner") {
    return NextResponse.json(
      { error: "owner_always_allowed", message: "Le propriétaire dispose déjà de ces droits." },
      { status: 400 },
    )
  }

  const { error } = await admin
    .from("profiles")
    .update(patch)
    .eq("user_id", targetUserId)
    .eq("organization_id", caller.organization_id)

  if (error) {
    console.error("[/api/cabinet/delegate-settings]", error)
    return NextResponse.json({ error: "DB error" }, { status: 500 })
  }

  return NextResponse.json({ ok: true, userId: targetUserId, ...patch })
}
