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
import { hasActiveAccess, hasPricingAccess } from "@/lib/subscription"

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
    .select("trial_ends_at, subscription_status, current_period_end, pending_deletion_at")
    .eq("id", profile.organization_id)
    .maybeSingle()

  // Suppression programmée : lecture seule pour tout le monde, même si l'abo
  // est encore actif (on a demandé à supprimer → plus de mutations). Cohérent
  // avec isWorkspaceReadOnly côté UI. Annulable via /api/cabinet/cancel-deletion.
  if (org?.pending_deletion_at) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "deletion_scheduled",
          message:
            "La suppression de l'organisation est programmée — l'accès est en lecture seule. Annulez la suppression pour reprendre.",
        },
        { status: 403 },
      ),
    }
  }

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

/**
 * Garde-fou d'ENTITLEMENT pour la Suite Pricing Syntec.
 *
 * La Suite Pricing est une OPTION payante (add-on `pricing_addon`, cf.
 * lib/pricing-plan.ts) : y accéder sans l'avoir prise revient à utiliser
 * gratuitement ce qu'on facture. Or `hasPricingAccess()` existait déjà et était
 * correct, mais n'était appelé que par le formulaire mission et /organisation :
 * la page /workspace/pricing, l'onglet de nav et TOUTES les routes API pricing
 * étaient ouverts à n'importe quel client Sourcing. `requireActiveAccess` ne
 * comblait pas le trou — il ne teste que l'accès et le siège, pas l'option.
 *
 * Contrairement à `requireActiveAccess`, ce garde s'applique aussi aux
 * LECTURES : générer une fiche pricing PDF ou comparer deux scénarios EST la
 * fonctionnalité vendue, même si c'est un GET.
 *
 * Autorisé si : admin Naywa · essai gratuit actif · abonnement avec l'option.
 */
export async function requirePricingAccess(): Promise<ActiveAccessResult> {
  const base = await requireActiveAccess()
  if (!base.ok) return base
  // Admin Naywa : requireActiveAccess a déjà tranché.
  if (base.isAdmin) return base

  const admin = getAdminSupabase()
  const { data: org } = await admin
    .from("organizations")
    .select("trial_ends_at, subscription_status, current_period_end, subscription_has_pricing")
    .eq("id", base.orgId)
    .maybeSingle()

  if (!hasPricingAccess(org)) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "pricing_not_included",
          message:
            "La Suite Pricing n'est pas incluse dans votre abonnement. Activez-la depuis votre organisation.",
        },
        { status: 403 },
      ),
    }
  }

  return base
}
