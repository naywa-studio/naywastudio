/**
 * GET /api/admin/search?q=...
 *
 * Recherche cross-org/user pour le support. Admin-only.
 *
 * Critère : matche les profiles dont le first_name OU l'email auth
 * contient `q` (case-insensitive). Limité à 30 résultats. Pour chaque
 * profile on retourne :
 *   - user info (first_name, email)
 *   - org info (id, name, brand_name)
 *   - role (owner/member)
 *   - has_sourcing_seat
 *   - subscription_status de l'org
 *   - dernière connexion (auth.users.last_sign_in_at)
 *
 * Journalisé dans admin_audit_log avec metadata.query = q.
 *
 * Lecture seule : pas de modification, pas d'impersonate.
 */

import { NextRequest, NextResponse } from "next/server"
import { logAdminAction, requireAdmin } from "@/lib/admin"
import { getAdminSupabase } from "@/lib/admin-supabase"

export const runtime = "nodejs"

const MAX_RESULTS = 30

export async function GET(req: NextRequest) {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.response

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim()
  if (q.length < 2) {
    // Tape <2 caractères = on ne fait rien (évite de tout retourner).
    return NextResponse.json({ results: [], message: "Saisissez au moins 2 caractères." })
  }

  await logAdminAction({
    adminUserId: gate.userId,
    action: "search_users",
    metadata: { query: q },
  })

  const admin = getAdminSupabase()
  // On tire la list des auth.users matchant l'email — le seul moyen
  // est de passer par admin.auth.admin.listUsers() qui retourne tous
  // les users (paginated). Pour un user base petite (< 1000), on peut
  // pull tout et filter côté code. On ajustera quand on dépassera.
  const { data: authList } = await admin.auth.admin.listUsers({ perPage: 1000 })
  const lowerQ = q.toLowerCase()
  const matchedUsers = (authList?.users ?? []).filter((u) =>
    (u.email ?? "").toLowerCase().includes(lowerQ),
  )

  // En parallèle, recherche sur first_name (profiles RLS-bypassée).
  const { data: byName } = await admin
    .from("profiles")
    .select("user_id, first_name, role, has_sourcing_seat, organization_id")
    .ilike("first_name", `%${q}%`)
    .limit(MAX_RESULTS)

  // Fusion : on prend les user_ids des deux sources, dédupliqués.
  const userIds = new Set<string>([
    ...matchedUsers.map((u) => u.id),
    ...(byName ?? []).map((p) => p.user_id),
  ])
  if (userIds.size === 0) {
    return NextResponse.json({ results: [] })
  }

  // On enrichit avec profile + org.
  const { data: profiles } = await admin
    .from("profiles")
    .select(`
      user_id, first_name, role, has_sourcing_seat, organization_id,
      organizations:organization_id (
        id, name, brand_name, subscription_status, trial_ends_at,
        pending_deletion_at
      )
    `)
    .in("user_id", Array.from(userIds))
    .limit(MAX_RESULTS)

  const authById = new Map(
    (authList?.users ?? []).map((u) => [u.id, u]),
  )

  const results = (profiles ?? []).map((p) => {
    const authUser = authById.get(p.user_id)
    // Le typage Supabase pour les relations imbriquées peut renvoyer
    // soit un objet, soit un tableau de un. On normalise.
    const orgRaw = (p as unknown as { organizations: unknown }).organizations
    const org = Array.isArray(orgRaw) ? orgRaw[0] : orgRaw
    return {
      user_id: p.user_id,
      first_name: p.first_name,
      email: authUser?.email ?? null,
      last_sign_in_at: authUser?.last_sign_in_at ?? null,
      role: p.role,
      has_sourcing_seat: p.has_sourcing_seat,
      organization: org
        ? {
            id: (org as { id: string }).id,
            name:
              (org as { brand_name: string | null; name: string }).brand_name
              ?? (org as { name: string }).name,
            subscription_status:
              (org as { subscription_status: string | null }).subscription_status,
            trial_ends_at:
              (org as { trial_ends_at: string | null }).trial_ends_at,
            pending_deletion_at:
              (org as { pending_deletion_at: string | null }).pending_deletion_at,
          }
        : null,
    }
  })

  return NextResponse.json({ results })
}
