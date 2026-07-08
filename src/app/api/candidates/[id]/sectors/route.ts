/**
 * PATCH /api/candidates/:id/sectors
 *
 * Met à jour les secteurs d'un candidat (revue à l'import, édition vivier).
 * Par défaut, une modification humaine passe le statut à "validated" (le
 * sourceur a confirmé, qu'il ait accepté Nora ou changé). Crée à la volée les
 * secteurs saisis qui n'existent pas encore (created_by = 'user').
 *
 * RLS org-scopée : un candidat d'une autre org ne matchera pas l'update.
 */

import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"

export const runtime = "nodejs"

function cleanSectors(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const x of raw) {
    const s = String(x).trim()
    if (!s || s.length > 40) continue
    const k = s.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    out.push(s)
    if (out.length >= 20) break
  }
  return out
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })

  const body = await req.json().catch(() => null) as { sectors?: unknown; status?: unknown } | null
  const sectors = cleanSectors(body?.sectors)
  const status: "validated" | "to_review" = body?.status === "to_review" ? "to_review" : "validated"

  const { data: profile } = await sb
    .from("profiles").select("organization_id").eq("user_id", user.id).maybeSingle()
  if (!profile?.organization_id) {
    return NextResponse.json({ error: "no_organization" }, { status: 400 })
  }

  // Crée les secteurs saisis qui n'existent pas encore.
  if (sectors.length > 0) {
    await sb.from("sectors").upsert(
      sectors.map((name) => ({ organization_id: profile.organization_id, name, created_by: "user" as const })),
      { onConflict: "organization_id,name", ignoreDuplicates: true },
    )
  }

  const { data, error } = await sb
    .from("candidates")
    .update({ sectors, sector_status: status })
    .eq("id", id)
    .select("id, sectors, sector_status")
    .single()
  if (error || !data) return NextResponse.json({ error: "not_found" }, { status: 404 })

  return NextResponse.json({ ok: true, candidate: data })
}
