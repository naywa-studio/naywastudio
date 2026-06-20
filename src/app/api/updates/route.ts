/**
 * GET /api/updates
 *
 * Renvoie la liste des nouveautés publiées (published_at <= now()),
 * triées du plus récent au plus ancien, avec pour chaque update un
 * booléen `is_read` calculé pour le user courant.
 *
 * Lecture autorisée à tout user authentifié — c'est sous-jacent un
 * changelog produit, pas un secret. La RLS sur app_updates filtre
 * déjà les non-publiées.
 *
 * Réponse :
 *   { updates: Array<{
 *       id, title, body, category, published_at, is_read
 *     }>,
 *     unread_count
 *   }
 */

import { NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { getAdminSupabase } from "@/lib/admin-supabase"

export const runtime = "nodejs"

export async function GET() {
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })

  // On lit les updates via le client RLS (filtre auto les non-publiées).
  const { data: updates, error } = await sb
    .from("app_updates")
    .select("id, title, body, category, published_at")
    .order("published_at", { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!updates || updates.length === 0) {
    return NextResponse.json({ updates: [], unread_count: 0 })
  }

  // On récupère les reads du user courant pour calculer is_read.
  // Via admin client (les reads RLS sont déjà restreintes au user
  // mais on veut juste un set d'IDs lus, et l'admin client est plus
  // direct ici).
  const admin = getAdminSupabase()
  const updateIds = updates.map((u) => u.id)
  const { data: reads } = await admin
    .from("app_updates_reads")
    .select("update_id")
    .eq("user_id", user.id)
    .in("update_id", updateIds)
  const readIds = new Set((reads ?? []).map((r) => r.update_id))

  const payload = updates.map((u) => ({
    id: u.id,
    title: u.title,
    body: u.body,
    category: u.category,
    published_at: u.published_at,
    is_read: readIds.has(u.id),
  }))
  const unreadCount = payload.filter((u) => !u.is_read).length

  return NextResponse.json({ updates: payload, unread_count: unreadCount })
}
