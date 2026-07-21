/**
 * PATCH  /api/vivier/zones/:id — édite label/description d'une zone
 * DELETE /api/vivier/zones/:id — supprime une zone
 *
 * À la suppression, les candidats dont les cluster_assignments référencent
 * cette zone sont nettoyés (on enlève l'entrée du tableau JSON). S'ils
 * n'ont plus aucune assignation, ils ne sont rangés nulle part jusqu'au
 * prochain re-clustering — ils apparaissent dans la vue plate du vivier
 * mais pas sur la carte.
 *
 * Le label "Autre" (FALLBACK_ZONE_LABEL) ne peut être ni édité ni supprimé.
 */

import { NextRequest, NextResponse } from "next/server"
import { getAdminSupabase } from "@/lib/admin-supabase"
import { requireActiveAccess } from "@/lib/access-guard"
import {
  FALLBACK_ZONE_LABEL,
  sanitizeZoneDescription,
  sanitizeZoneLabel,
} from "@/lib/cluster-taxonomy"
import type { ClusterAssignment } from "@/lib/database.types"

export const runtime = "nodejs"

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  // Mutation : doit être bloquée en lecture seule comme toutes les autres
  // routes de mutation du workspace.
  const gate = await requireActiveAccess()
  if (!gate.ok) return gate.response
  const orgId = gate.orgId

  const body = await req.json().catch(() => null) as
    { label?: unknown; description?: unknown } | null

  const admin = getAdminSupabase()
  const { data: existing } = await admin
    .from("cluster_manifests")
    .select("label")
    .eq("id", id)
    .eq("organization_id", orgId)
    .maybeSingle()
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 })
  if (existing.label === FALLBACK_ZONE_LABEL) {
    return NextResponse.json({
      error: "reserved_label",
      message: `La zone "${FALLBACK_ZONE_LABEL}" est système et non modifiable.`,
    }, { status: 400 })
  }

  const patch: { label?: string; description?: string } = {}
  if (body?.label !== undefined) {
    const label = sanitizeZoneLabel(body.label)
    if (!label) {
      return NextResponse.json({ error: "invalid_label" }, { status: 400 })
    }
    if (label.toLowerCase() === FALLBACK_ZONE_LABEL.toLowerCase()) {
      return NextResponse.json({
        error: "reserved_label",
        message: `"${FALLBACK_ZONE_LABEL}" est une zone système réservée.`,
      }, { status: 400 })
    }
    patch.label = label
  }
  if (body?.description !== undefined) {
    const description = sanitizeZoneDescription(body.description)
    if (!description) {
      return NextResponse.json({ error: "invalid_description" }, { status: 400 })
    }
    patch.description = description
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "empty_patch" }, { status: 400 })
  }

  const { data: updated, error: updErr } = await admin
    .from("cluster_manifests")
    .update(patch)
    .eq("id", id)
    .eq("organization_id", orgId)
    .select("id, label, description, candidate_count, is_seed, display_order, created_at, updated_at")
    .single()
  if (updErr) {
    if (updErr.code === "23505") {
      return NextResponse.json({
        error: "duplicate_label",
        message: "Une autre zone porte déjà ce nom.",
      }, { status: 409 })
    }
    console.error("[vivier/zones/:id] update failed:", updErr.message)
    return NextResponse.json({ error: "update_failed", detail: "internal_error" }, { status: 500 })
  }

  // Si le label a changé, on doit aussi mettre à jour les cluster_assignments
  // des candidats qui référencent l'ancien label. On lit, on remplace,
  // on écrit. Coût acceptable car limité à l'org.
  if (patch.label && existing.label !== patch.label) {
    const newLabel = patch.label as string
    const { data: cands } = await admin
      .from("candidates")
      .select("id, cluster_assignments")
      .eq("organization_id", orgId)
      .not("cluster_assignments", "is", null)
    for (const c of cands ?? []) {
      const arr = (c.cluster_assignments ?? []) as ClusterAssignment[]
      let touched = false
      const next = arr.map((a) => {
        if (a.label === existing.label) { touched = true; return { ...a, label: newLabel } }
        return a
      })
      if (touched) {
        await admin
          .from("candidates")
          .update({ cluster_assignments: next })
          .eq("id", c.id)
      }
    }
  }

  return NextResponse.json({ zone: updated })
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  // Mutation : doit être bloquée en lecture seule comme toutes les autres
  // routes de mutation du workspace.
  const gate = await requireActiveAccess()
  if (!gate.ok) return gate.response
  const orgId = gate.orgId

  const admin = getAdminSupabase()
  const { data: existing } = await admin
    .from("cluster_manifests")
    .select("label")
    .eq("id", id)
    .eq("organization_id", orgId)
    .maybeSingle()
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 })
  if (existing.label === FALLBACK_ZONE_LABEL) {
    return NextResponse.json({
      error: "reserved_label",
      message: `La zone "${FALLBACK_ZONE_LABEL}" est système et non supprimable.`,
    }, { status: 400 })
  }

  // Nettoie les cluster_assignments référencant cette zone sur tous les
  // candidats de l'org.
  const { data: cands } = await admin
    .from("candidates")
    .select("id, cluster_assignments")
    .eq("organization_id", orgId)
    .not("cluster_assignments", "is", null)
  for (const c of cands ?? []) {
    const arr = (c.cluster_assignments ?? []) as ClusterAssignment[]
    const next = arr.filter((a) => a.label !== existing.label)
    if (next.length !== arr.length) {
      await admin
        .from("candidates")
        .update({ cluster_assignments: next.length > 0 ? next : null })
        .eq("id", c.id)
    }
  }

  const { error: delErr } = await admin
    .from("cluster_manifests")
    .delete()
    .eq("id", id)
    .eq("organization_id", orgId)
  if (delErr) {
    console.error("[vivier/zones/:id] delete failed:", delErr.message)
    return NextResponse.json({ error: "delete_failed", detail: "internal_error" }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
