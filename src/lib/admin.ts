/**
 * Helpers rôle administrateur Naywa.
 *
 * L'admin est un statut transverse aux organisations (cf. migration
 * 041), stocké dans profiles.is_admin. Il ouvre l'accès à /admin
 * (KPIs, recherche support, CRUD nouveautés, validation demandes
 * branding) et bypasse les gates de paiement / siège pour permettre
 * à l'équipe Naywa de tester le produit sans souscrire.
 *
 * Sécurité :
 *  - Chaque route admin doit appeler `requireAdmin()` en première
 *    ligne et renvoyer la NextResponse de refus telle quelle si
 *    l'appelant n'est pas admin.
 *  - On NE lit JAMAIS is_admin depuis le client (jamais exposé au
 *    navigateur), uniquement côté server avec le client admin
 *    (bypass RLS) pour éviter qu'un user altère son propre profil
 *    et se promeut admin.
 */

import { NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { getAdminSupabase } from "@/lib/admin-supabase"

/**
 * Renvoie true si le user_id donné a is_admin = true en DB.
 * Utilise le client admin pour bypasser RLS (sinon il faudrait une
 * policy spécifique qui exposerait le flag).
 */
export async function isAdmin(userId: string): Promise<boolean> {
  if (!userId) return false
  const admin = getAdminSupabase()
  const { data } = await admin
    .from("profiles")
    .select("is_admin")
    .eq("user_id", userId)
    .maybeSingle()
  return data?.is_admin === true
}

/**
 * Résultat de `requireAdmin()`. Soit { ok: true, userId } qui
 * autorise la suite de la route, soit { response } à `return`
 * tel quel pour interrompre.
 */
export type RequireAdminResult =
  | { ok: true; userId: string }
  | { ok: false; response: NextResponse }

/**
 * Garde-fou pour les routes /api/admin/*.
 *
 * Vérifie que la session est authentifiée et que le user est admin.
 * Renvoie 401 si non auth, 403 si pas admin. La route appelante
 * `return` directement le `response` quand `ok === false`.
 *
 * Pattern d'usage :
 *
 *   const gate = await requireAdmin()
 *   if (!gate.ok) return gate.response
 *   const { userId } = gate
 *   // ... suite de la route, userId est admin
 */
export async function requireAdmin(): Promise<RequireAdminResult> {
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "unauthenticated" }, { status: 401 }),
    }
  }
  if (!(await isAdmin(user.id))) {
    return {
      ok: false,
      response: NextResponse.json({ error: "forbidden" }, { status: 403 }),
    }
  }
  return { ok: true, userId: user.id }
}

/**
 * Type d'action métier journalisée dans admin_audit_log.
 * Liste closed pour homogénéiser les requêtes et faciliter la
 * relecture côté audit.
 */
export type AdminAuditAction =
  | "search_users"
  | "view_user"
  | "view_organization"
  | "list_branding_requests"
  | "approve_branding_request"
  | "reject_branding_request"
  | "publish_update"
  | "update_app_update"
  | "delete_update"
  | "set_quota_override"
  | "clear_quota_override"
  | "migrate_cv_to_r2"
  | "extend_trial"
  | "reset_trial"

/**
 * Type de la cible auditée. NULL pour les actions globales (search).
 */
export type AdminAuditTargetType =
  | "user"
  | "organization"
  | "app_update"
  | "branding_request"

/**
 * Écrit une ligne dans admin_audit_log. Best-effort (silently
 * fail-safe) : si l'insert échoue on ne casse pas la route, on
 * log juste l'erreur côté serveur. La journalisation est
 * importante mais ne doit jamais bloquer l'action métier.
 */
export async function logAdminAction(params: {
  adminUserId: string
  action: AdminAuditAction
  targetType?: AdminAuditTargetType | null
  targetId?: string | null
  metadata?: Record<string, unknown>
}): Promise<void> {
  const admin = getAdminSupabase()
  const { error } = await admin.from("admin_audit_log").insert({
    admin_user_id: params.adminUserId,
    action: params.action,
    target_type: params.targetType ?? null,
    target_id: params.targetId ?? null,
    metadata: params.metadata ?? {},
  })
  if (error) {
    console.error("[admin/audit] insert failed", error)
  }
}
