import { NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { getAdminSupabase } from "@/lib/admin-supabase"
import { CURRENT_CGU_VERSION } from "@/lib/cgu"

export const runtime = "nodejs"

/**
 * POST /api/cgu/accept
 *
 * Enregistre l'acceptation des CGU (version courante) pour l'utilisateur
 * authentifié. Écrit côté serveur via le client admin → l'user ne peut pas
 * falsifier son propre horodatage. Sert :
 *   - au signup (stamp silencieux du profil, porté depuis les metadata / le
 *     callback OAuth) ;
 *   - à la bannière de rappel des comptes antérieurs (ex. GMH).
 *
 * Idempotent : ré-appeler ne fait que réécrire la même version + une date
 * plus récente. On stampe TOUJOURS l'utilisateur courant, jamais un autre.
 */
export async function POST() {
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })

  const admin = getAdminSupabase()
  const { error } = await admin
    .from("profiles")
    .update({
      cgu_accepted_at: new Date().toISOString(),
      cgu_version: CURRENT_CGU_VERSION,
    })
    .eq("user_id", user.id)

  if (error) {
    console.error("[/api/cgu/accept]", error)
    return NextResponse.json({ error: "DB error" }, { status: 500 })
  }
  return NextResponse.json({ ok: true, cgu_version: CURRENT_CGU_VERSION })
}
