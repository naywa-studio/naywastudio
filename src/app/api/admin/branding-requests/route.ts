/**
 * GET /api/admin/branding-requests
 *
 * Liste les demandes de modification branding pour le panneau admin,
 * regroupées par batch (1 batch = 1 soumission utilisateur qui a pu
 * cocher plusieurs champs dans le même formulaire).
 *
 * Filtrable via ?status=pending|decided|all (défaut pending).
 *
 * Réponse :
 *   { batches: Array<{
 *       batch_id, organization, requester, reason, created_at,
 *       changes: [{ id, field, current_value, requested_value, status,
 *                   decided_by, decided_at, decision_note }]
 *     }> }
 *
 * Notes d'implémentation :
 *  - Pas de jointure Supabase directe sur `requested_by` parce que la
 *    FK pointe vers auth.users (et non profiles) — l'auto-discovery
 *    Supabase ne trouve pas la relation et fait planter la query
 *    silencieusement (les demandes disparaissaient côté UI). On résout
 *    en 2 round-trips DB séparés, acceptable < 100 demandes en attente.
 *  - Le critère "pending vs decided" s'applique au batch complet :
 *    si AU MOINS une row du batch est pending, on liste dans pending.
 */

import { NextRequest, NextResponse } from "next/server"
import { logAdminAction, requireAdmin } from "@/lib/admin"
import { getAdminSupabase } from "@/lib/admin-supabase"
import type { BrandingChangeField, BrandingChangeStatus } from "@/lib/database.types"

export const runtime = "nodejs"

interface ChangeRow {
  id: string
  field: BrandingChangeField
  current_value: string | null
  requested_value: string
  status: BrandingChangeStatus
  decided_by: string | null
  decided_at: string | null
  decision_note: string | null
}

interface BatchPayload {
  batch_id: string
  organization: { id: string; name: string } | null
  requester: { user_id: string; first_name: string | null; email: string | null } | null
  reason: string | null
  created_at: string
  changes: ChangeRow[]
}

export async function GET(req: NextRequest) {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.response

  const filter = req.nextUrl.searchParams.get("status") ?? "pending"
  const admin = getAdminSupabase()

  const { data: rows, error } = await admin
    .from("branding_change_requests")
    .select(`
      id, organization_id, requested_by, field,
      current_value, requested_value, reason, status,
      decided_by, decided_at, decision_note,
      request_batch_id, created_at
    `)
    .order("created_at", { ascending: false })
    .limit(300)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const allRows = rows ?? []

  // Regroupement par request_batch_id.
  const batchesMap = new Map<string, {
    organization_id: string
    requested_by: string | null
    reason: string | null
    created_at: string
    rows: ChangeRow[]
  }>()
  for (const r of allRows) {
    let bucket = batchesMap.get(r.request_batch_id)
    if (!bucket) {
      bucket = {
        organization_id: r.organization_id,
        requested_by: r.requested_by,
        reason: r.reason,
        created_at: r.created_at,
        rows: [],
      }
      batchesMap.set(r.request_batch_id, bucket)
    }
    bucket.rows.push({
      id: r.id,
      field: r.field,
      current_value: r.current_value,
      requested_value: r.requested_value,
      status: r.status,
      decided_by: r.decided_by,
      decided_at: r.decided_at,
      decision_note: r.decision_note,
    })
    // created_at du batch = le plus ancien des rows (point de soumission).
    if (new Date(r.created_at).getTime() < new Date(bucket.created_at).getTime()) {
      bucket.created_at = r.created_at
    }
  }

  // Filtrage status au niveau batch.
  const filteredEntries = Array.from(batchesMap.entries()).filter(([, b]) => {
    const hasPending = b.rows.some((row) => row.status === "pending")
    if (filter === "pending") return hasPending
    if (filter === "decided") return !hasPending
    return true
  })

  // Hydratation organisations + profiles + emails en parallèle.
  const orgIds = Array.from(new Set(filteredEntries.map(([, b]) => b.organization_id)))
  const userIds = Array.from(new Set(
    filteredEntries.map(([, b]) => b.requested_by).filter((v): v is string => !!v),
  ))

  const [orgsRes, profilesRes] = await Promise.all([
    orgIds.length
      ? admin.from("organizations").select("id, name, brand_name").in("id", orgIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string; brand_name: string | null }> }),
    userIds.length
      ? admin.from("profiles").select("user_id, first_name").in("user_id", userIds)
      : Promise.resolve({ data: [] as Array<{ user_id: string; first_name: string | null }> }),
  ])

  const orgById = new Map(
    (orgsRes.data ?? []).map((o) => [o.id, {
      id: o.id,
      name: o.brand_name ?? o.name ?? "(sans nom)",
    }]),
  )
  const profileByUserId = new Map(
    (profilesRes.data ?? []).map((p) => [p.user_id, p]),
  )

  // Emails via admin.auth.admin.getUserById en parallèle.
  const emailEntries = await Promise.all(
    userIds.map(async (uid) => {
      const { data } = await admin.auth.admin.getUserById(uid)
      return [uid, data?.user?.email ?? null] as const
    }),
  )
  const emailByUserId = new Map(emailEntries)

  // Tri final : par created_at du batch desc.
  filteredEntries.sort((a, b) =>
    new Date(b[1].created_at).getTime() - new Date(a[1].created_at).getTime(),
  )

  const batches: BatchPayload[] = filteredEntries.map(([batchId, b]) => {
    const profile = b.requested_by ? profileByUserId.get(b.requested_by) : null
    return {
      batch_id: batchId,
      organization: orgById.get(b.organization_id) ?? null,
      requester: b.requested_by
        ? {
          user_id: b.requested_by,
          first_name: profile?.first_name ?? null,
          email: emailByUserId.get(b.requested_by) ?? null,
        }
        : null,
      reason: b.reason,
      created_at: b.created_at,
      // Ordre des changes : nom > logo > email (lisibilité).
      changes: [...b.rows].sort((x, y) => fieldOrder(x.field) - fieldOrder(y.field)),
    }
  })

  await logAdminAction({
    adminUserId: gate.userId,
    action: "list_branding_requests",
    metadata: { filter, batches: batches.length, rows: allRows.length },
  })

  return NextResponse.json({ batches })
}

function fieldOrder(field: BrandingChangeField): number {
  if (field === "name") return 0
  if (field === "brand_logo_path") return 1
  if (field === "contact_email") return 2
  return 99
}
