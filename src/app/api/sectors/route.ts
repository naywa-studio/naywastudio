/**
 * GET  /api/sectors  — liste des secteurs de l'org + comptage de candidats
 *                      par secteur + total "à classer" (feed des cartes vivier).
 * POST /api/sectors  — crée un secteur { name } (created_by = 'user').
 *
 * RLS org-scopée via le client server (policy `sectors_org_all`). Le comptage
 * lit les colonnes `sectors` + `sector_status` des candidats (léger).
 */

import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"

export const runtime = "nodejs"

export async function GET() {
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })

  const [{ data: sectorsRows }, { data: candRows }] = await Promise.all([
    sb.from("sectors").select("id, name, created_by, created_at").order("name", { ascending: true }),
    sb.from("candidates").select("sectors, sector_status"),
  ])

  const counts = new Map<string, number>()
  let toReview = 0
  for (const c of candRows ?? []) {
    const secs = (c.sectors ?? []) as string[]
    if (c.sector_status === "to_review" || secs.length === 0) toReview++
    for (const s of secs) counts.set(s, (counts.get(s) ?? 0) + 1)
  }

  const sectors = (sectorsRows ?? []).map((s) => ({
    ...s,
    count: counts.get(s.name) ?? 0,
  }))

  return NextResponse.json({ sectors, to_review_count: toReview })
}

export async function POST(req: NextRequest) {
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })

  const { data: profile } = await sb
    .from("profiles")
    .select("organization_id")
    .eq("user_id", user.id)
    .maybeSingle()
  if (!profile?.organization_id) {
    return NextResponse.json({ error: "no_organization" }, { status: 400 })
  }

  const body = await req.json().catch(() => null) as { name?: unknown } | null
  const name = typeof body?.name === "string" ? body.name.trim() : ""
  if (!name || name.length > 60) {
    return NextResponse.json({ error: "invalid_name" }, { status: 400 })
  }

  const { data, error } = await sb
    .from("sectors")
    .insert({ organization_id: profile.organization_id, name, created_by: "user" })
    .select("id, name, created_by, created_at")
    .single()

  // 23505 = unique_violation → le secteur existe déjà, on le renvoie.
  if (error) {
    if (error.code === "23505") {
      const { data: existing } = await sb
        .from("sectors")
        .select("id, name, created_by, created_at")
        .eq("name", name)
        .maybeSingle()
      if (existing) return NextResponse.json({ ok: true, sector: existing, existed: true })
    }
    return NextResponse.json({ error: "create_failed", detail: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, sector: data })
}
