/**
 * GET  /api/vivier/zones — liste les zones de l'org (taxonomie complète)
 * POST /api/vivier/zones — crée une zone manuellement (label + description)
 *
 * Les zones sont la TAXONOMIE FERMÉE utilisée par le clustering (cf.
 * lib/cluster-taxonomy.ts). Le sourceur les gère via le panneau "Mes
 * zones" sur /workspace/vivier.
 *
 * Le label "Autre" est réservé (fallback système, jamais créable manuellement).
 */

import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { getAdminSupabase } from "@/lib/admin-supabase"
import { requireActiveAccess } from "@/lib/access-guard"
import {
  FALLBACK_ZONE_LABEL,
  MAX_ZONES_PER_ORG,
  sanitizeZoneDescription,
  sanitizeZoneLabel,
} from "@/lib/cluster-taxonomy"

export const runtime = "nodejs"

export async function GET() {
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })

  const { data: rows, error } = await sb
    .from("cluster_manifests")
    .select("id, label, description, candidate_count, is_seed, display_order, created_at, updated_at")
    .order("display_order", { ascending: true })
    .order("label", { ascending: true })
  if (error) {
    console.error("[vivier/zones] list failed:", error.message)
    return NextResponse.json({ error: "list_failed", detail: "internal_error" }, { status: 500 })
  }
  return NextResponse.json({ zones: rows ?? [] })
}

export async function POST(req: NextRequest) {
  // Mutation (crée une zone de taxonomie) : doit être bloquée en lecture
  // seule comme toutes les autres routes de mutation du workspace.
  const gate = await requireActiveAccess()
  if (!gate.ok) return gate.response
  const orgId = gate.orgId
  const userId = gate.userId

  const body = await req.json().catch(() => null) as
    { label?: unknown; description?: unknown } | null
  const label = sanitizeZoneLabel(body?.label)
  const description = sanitizeZoneDescription(body?.description)
  if (!label || !description) {
    return NextResponse.json({
      error: "invalid_input",
      message: "Le nom doit faire 2-60 caractères et la description 10-280.",
    }, { status: 400 })
  }
  if (label.toLowerCase() === FALLBACK_ZONE_LABEL.toLowerCase()) {
    return NextResponse.json({
      error: "reserved_label",
      message: `"${FALLBACK_ZONE_LABEL}" est une zone système réservée.`,
    }, { status: 400 })
  }

  const admin = getAdminSupabase()

  // Vérifie le cap MAX_ZONES_PER_ORG.
  const { count } = await admin
    .from("cluster_manifests")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
  if ((count ?? 0) >= MAX_ZONES_PER_ORG) {
    return NextResponse.json({
      error: "too_many_zones",
      message: `Limite atteinte : ${MAX_ZONES_PER_ORG} zones max. Supprimez-en une avant d'en créer une nouvelle.`,
    }, { status: 400 })
  }

  const { data: created, error: insErr } = await admin
    .from("cluster_manifests")
    .insert({
      organization_id: orgId,
      label,
      description,
      candidate_count: 0,
      is_seed: false,
      created_by_user_id: userId,
      display_order: 100,
    })
    .select("id, label, description, candidate_count, is_seed, display_order, created_at, updated_at")
    .single()
  if (insErr || !created) {
    if (insErr?.code === "23505") {
      return NextResponse.json({
        error: "duplicate_label",
        message: "Une zone avec ce nom existe déjà.",
      }, { status: 409 })
    }
    console.error("[vivier/zones] create failed:", insErr?.message)
    return NextResponse.json({ error: "create_failed", detail: "internal_error" }, { status: 500 })
  }
  return NextResponse.json({ zone: created })
}
