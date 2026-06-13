/**
 * DELETE /api/account/me
 *
 * Supprime le compte utilisateur courant. Comportement selon le rôle :
 *
 *   - Member : retire le profile et supprime l'auth.user. Le cabinet
 *     reste intact, son siège est libéré pour l'owner.
 *
 *   - Owner solo (pas d'autres membres) : supprime le cabinet
 *     immédiatement (cascade vers candidats, missions, etc.), puis
 *     supprime l'auth.user. Équivalent à DELETE /api/cabinet sans grace
 *     period puisqu'il n'y a personne à protéger.
 *
 *   - Owner avec membres : 409. L'owner doit d'abord soit transférer
 *     l'ownership (pas encore implémenté) soit supprimer son cabinet
 *     via /organisation?tab=securite. On ne veut pas qu'un owner
 *     coupe l'accès des autres membres en cliquant ici.
 *
 * Le compte une fois supprimé est définitif. Pas de soft delete, pas
 * de récupération.
 */

import { NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { getAdminSupabase } from "@/lib/admin-supabase"

export const runtime = "nodejs"

export async function DELETE() {
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 })
  }

  const admin = getAdminSupabase()

  // Lit le profile + rôle. RLS-scoped pour confirmer que l'user existe.
  const { data: profile, error: profileErr } = await sb
    .from("profiles")
    .select("user_id, organization_id, role")
    .eq("user_id", user.id)
    .single()
  if (profileErr || !profile) {
    return NextResponse.json({ error: "Profil introuvable" }, { status: 404 })
  }

  // Owner avec d'autres membres -> refus, l'user doit gérer son cabinet d'abord.
  if (profile.role === "owner") {
    const { count } = await admin
      .from("profiles")
      .select("user_id", { count: "exact", head: true })
      .eq("organization_id", profile.organization_id)
      .neq("user_id", user.id)

    if ((count ?? 0) > 0) {
      return NextResponse.json(
        {
          error: "Vous êtes propriétaire d'un cabinet avec d'autres membres. " +
            "Supprimez votre cabinet depuis l'onglet Sécurité de /organisation " +
            "(ou retirez vos membres) avant de supprimer votre compte.",
          code: "owner_has_members",
        },
        { status: 409 },
      )
    }

    // Owner solo -> nettoyage du cabinet en cascade.
    const { data: org } = await admin
      .from("organizations")
      .select("id, brand_logo_path")
      .eq("id", profile.organization_id)
      .single()
    if (org) {
      const { error: delOrgErr } = await admin
        .from("organizations")
        .delete()
        .eq("id", org.id)
      if (delOrgErr) {
        console.error("[account/me DELETE] org delete:", delOrgErr)
        return NextResponse.json(
          { error: "Suppression du cabinet impossible. Réessayez plus tard." },
          { status: 500 },
        )
      }
      if (org.brand_logo_path) {
        await admin.storage.from("brand-logos").remove([org.brand_logo_path])
      }
    }
  } else {
    // Member -> juste retirer le profile. Le cabinet reste.
    const { error: delProfileErr } = await admin
      .from("profiles")
      .delete()
      .eq("user_id", user.id)
    if (delProfileErr) {
      console.error("[account/me DELETE] profile delete:", delProfileErr)
      return NextResponse.json(
        { error: "Suppression du profil impossible. Réessayez plus tard." },
        { status: 500 },
      )
    }
  }

  // Drop l'auth.user dans tous les cas. Sign out automatique côté client
  // au prochain refresh de session.
  const { error: authDelErr } = await admin.auth.admin.deleteUser(user.id)
  if (authDelErr) {
    console.error("[account/me DELETE] auth delete:", authDelErr)
    // Pas grave si ça échoue ici : le profile/org est déjà gone, c'est
    // l'état le plus critique. L'auth.user orphelin sera ramassé par
    // un cron de cleanup plus tard.
  }

  return NextResponse.json({ ok: true })
}
