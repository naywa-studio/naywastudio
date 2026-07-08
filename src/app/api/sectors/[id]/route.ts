/**
 * PATCH  /api/sectors/:id  — renomme / met à jour la définition d'un secteur.
 *                            Cascade le nouveau nom sur candidates.sectors +
 *                            jobs.target_sectors (le nom est la clé de liaison).
 * DELETE /api/sectors/:id  — supprime le secteur + retire son nom des candidats
 *                            et des missions (cascade applicative).
 *
 * RLS org-scopée (le secteur d'une autre org ne matchera pas). Les cascades
 * array sont faites en lisant/réécrivant les lignes concernées (pas de
 * fonction SQL — volumes faibles en V1).
 */

import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"

export const runtime = "nodejs"

async function renameInCandidates(
  sb: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  oldName: string, newName: string | null,
) {
  const { data } = await sb
    .from("candidates").select("id, sectors").contains("sectors", [oldName])
  for (const row of data ?? []) {
    const cur = (row.sectors ?? []) as string[]
    // Retire l'ancien nom, ajoute le nouveau (si rename), dédup.
    const next = Array.from(new Set(
      cur.flatMap((s) => s === oldName ? (newName ? [newName] : []) : [s]),
    ))
    await sb.from("candidates").update({ sectors: next }).eq("id", row.id)
  }
}

async function renameInJobs(
  sb: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  oldName: string, newName: string | null,
) {
  const { data } = await sb
    .from("jobs").select("id, target_sectors").contains("target_sectors", [oldName])
  for (const row of data ?? []) {
    const cur = (row.target_sectors ?? []) as string[]
    const next = Array.from(new Set(
      cur.flatMap((s) => s === oldName ? (newName ? [newName] : []) : [s]),
    ))
    await sb.from("jobs").update({ target_sectors: next }).eq("id", row.id)
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })

  const { data: sector } = await sb.from("sectors").select("id, name").eq("id", id).maybeSingle()
  if (!sector) return NextResponse.json({ error: "not_found" }, { status: 404 })

  const body = await req.json().catch(() => null) as { name?: unknown; description?: unknown } | null
  const rawName = typeof body?.name === "string" ? body.name.trim() : null
  const newName = rawName && rawName.length > 0 && rawName.length <= 60 ? rawName : null
  const hasDescription = typeof body?.description === "string"
  const description = hasDescription ? (body!.description as string).trim() || null : undefined

  const update: { name?: string; description?: string | null } = {}
  if (newName && newName !== sector.name) update.name = newName
  if (description !== undefined) update.description = description
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "nothing_to_update" }, { status: 400 })
  }

  const { data: updated, error } = await sb
    .from("sectors").update(update).eq("id", id)
    .select("id, name, description, created_by, created_at").single()
  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "name_taken" }, { status: 409 })
    return NextResponse.json({ error: "update_failed", detail: error.message }, { status: 500 })
  }

  // Cascade le rename sur les candidats + missions.
  if (update.name && update.name !== sector.name) {
    await renameInCandidates(sb, sector.name, update.name)
    await renameInJobs(sb, sector.name, update.name)
  }

  return NextResponse.json({ ok: true, sector: updated })
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })

  const { data: sector } = await sb.from("sectors").select("id, name").eq("id", id).maybeSingle()
  if (!sector) return NextResponse.json({ error: "not_found" }, { status: 404 })

  // Retire le nom des candidats + missions, puis supprime la ligne.
  await renameInCandidates(sb, sector.name, null)
  await renameInJobs(sb, sector.name, null)
  const { error } = await sb.from("sectors").delete().eq("id", id)
  if (error) return NextResponse.json({ error: "delete_failed", detail: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
