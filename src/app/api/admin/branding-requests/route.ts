/**
 * GET /api/admin/branding-requests
 *
 * Liste les demandes de modification branding pour le panneau admin.
 * Par défaut on retourne les pending. Filtrable via ?status=all|pending|decided
 *
 * Renvoie aussi le nom de l'org et le first_name du requester pour
 * ne pas devoir faire 3 round-trips côté UI.
 */

import { NextRequest, NextResponse } from "next/server"
import { logAdminAction, requireAdmin } from "@/lib/admin"
import { getAdminSupabase } from "@/lib/admin-supabase"

export const runtime = "nodejs"

export async function GET(req: NextRequest) {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.response

  const filter = req.nextUrl.searchParams.get("status") ?? "pending"
  const admin = getAdminSupabase()

  let q = admin
    .from("branding_change_requests")
    .select(`
      id, organization_id, requested_by, field,
      current_value, requested_value, reason, status,
      decided_by, decided_at, decision_note, created_at,
      organizations:organization_id ( id, name, brand_name ),
      requester:requested_by ( user_id, first_name )
    `)
    .order("created_at", { ascending: false })
    .limit(100)

  if (filter === "pending") {
    q = q.eq("status", "pending")
  } else if (filter === "decided") {
    q = q.in("status", ["approved", "rejected", "cancelled"])
  }

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAdminAction({
    adminUserId: gate.userId,
    action: "list_branding_requests",
    metadata: { filter, count: data?.length ?? 0 },
  })

  return NextResponse.json({ requests: data ?? [] })
}
