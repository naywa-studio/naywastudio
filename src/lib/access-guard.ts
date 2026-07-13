/**
 * Garde-fou d'accès pour les routes de MUTATION du workspace.
 *
 * Problème résolu : jusqu'ici le "lecture seule" (lockdown abonnement, essai
 * expiré, member sans siège) n'était appliqué QUE côté client (UI). Un user
 * en lecture seule pouvait donc muter via un appel API direct. Les routes LLM
 * étaient indirectement protégées (quota = 0 en lockdown), mais pas les
 * mutations non-quota (créer/éditer une mission, bouger une carte pipeline,
 * éditer un secteur, supprimer un CV…).
 *
 * Règle : autorisé si
 *   - admin Naywa (bypass total), OU
 *   - l'org a un accès actif (essai/abo) ET le user occupe un siège.
 * Sinon → 403.
 *
 * À appeler en 1ʳᵉ ligne des handlers de MUTATION (POST/PATCH/DELETE) du
 * workspace. Les LECTURES (GET) ne l'appellent pas. `getAdminSupabase`
 * (service-role) est utilisé pour lire l'org sans dépendre des policies RLS.
 */

import { NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { getAdminSupabase } from "@/lib/admin-supabase"
import { isAdmin } from "@/lib/admin"
import { hasActiveAccess } from "@/lib/subscription"

export type ActiveAccessResult =
  | { ok: true; userId: string; orgId: string; isAdmin: boolean }
  | { ok: false; response: NextResponse }

export async function requireActiveAccess(): Promise<ActiveAccessResult> {
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: "unauthenticated" }, { status: 401 }) }
  }

  const admin = getAdminSupabase()
  const { data: profile } = await admin
    .from("profiles")
    .select("organization_id, has_sourcing_seat")
    .eq("user_id", user.id)
    .maybeSingle()
  if (!profile?.organization_id) {
    return { ok: false, response: NextResponse.json({ error: "no_organization" }, { status: 400 }) }
  }

  const adminFlag = await isAdmin(user.id)

  // Admin Naywa : bypass total.
  if (adminFlag) {
    return { ok: true, userId: user.id, orgId: profile.organization_id, isAdmin: true }
  }

  const { data: org } = await admin
    .from("organizations")
    .select("trial_ends_at, subscription_status, current_period_end")
    .eq("id", profile.organization_id)
    .maybeSingle()

  if (!hasActiveAccess(org)) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "access_suspended",
          message:
            "Votre accès est suspendu (essai terminé ou abonnement inactif). Souscrivez pour reprendre.",
        },
        { status: 403 },
      ),
    }
  }

  if (!profile.has_sourcing_seat) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "no_seat",
          message: "Vous n'occupez pas de siège actif — l'accès workspace est en lecture seule.",
        },
        { status: 403 },
      ),
    }
  }

  return { ok: true, userId: user.id, orgId: profile.organization_id, isAdmin: false }
}
