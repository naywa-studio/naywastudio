/**
 * GET /api/cabinet/branding/requests
 *
 * Renvoie les demandes de modification branding faites par
 * l'organisation du caller — pour que l'owner suive l'état de ses
 * propres soumissions depuis /organisation (en cours / approuvées /
 * refusées).
 *
 * On ne renvoie que ce qui est utile à l'affichage côté owner :
 *   - les demandes pending (toujours visibles tant que pas décidées)
 *   - les demandes approved/rejected/cancelled des 30 derniers jours
 *     (au-delà on archive — pas la peine de polluer l'UI avec un
 *     historique ancien, le mail Resend a déjà été envoyé à la décision)
 *
 * Owner-only — un member ne voit pas l'historique des demandes.
 */

import { NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { getAdminSupabase } from "@/lib/admin-supabase"
import type { BrandingChangeField, BrandingChangeStatus } from "@/lib/database.types"

export const runtime = "nodejs"

interface RequestRow {
  id: string
  field: BrandingChangeField
  current_value: string | null
  requested_value: string
  status: BrandingChangeStatus
  decision_note: string | null
  decided_at: string | null
  created_at: string
  request_batch_id: string
}

const RECENT_WINDOW_DAYS = 30

export async function GET() {
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })

  const { data: profile } = await sb
    .from("profiles")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .maybeSingle()
  if (!profile || profile.role !== "owner") {
    return NextResponse.json({ error: "owner_only" }, { status: 403 })
  }

  const admin = getAdminSupabase()
  const sinceIso = new Date(Date.now() - RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()

  // Pending : pas de filtre date. Decided : seulement < 30j.
  const { data, error } = await admin
    .from("branding_change_requests")
    .select(`
      id, field, current_value, requested_value, status,
      decision_note, decided_at, created_at, request_batch_id
    `)
    .eq("organization_id", profile.organization_id)
    .or(`status.eq.pending,created_at.gte.${sinceIso}`)
    .order("created_at", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ requests: (data ?? []) as RequestRow[] })
}
