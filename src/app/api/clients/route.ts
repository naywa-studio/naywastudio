/**
 * GET  /api/clients — annuaire des clients de l'org + nb de missions par client.
 * POST /api/clients — crée un client { name, domain?, notes? }. Tout siège actif
 *                     (le sourceur crée un client à la volée à la création de
 *                     mission). Doublon insensible à la casse → renvoie l'existant.
 *
 * RLS org-scopée via le client server (policy `clients_org_all`).
 */

import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { requireActiveAccess } from "@/lib/access-guard"

export const runtime = "nodejs"

function cleanDomain(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const d = raw.trim().toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "")
  return d ? d.slice(0, 120) : null
}

export async function GET() {
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })

  const { data: profile } = await sb
    .from("profiles").select("organization_id").eq("user_id", user.id).maybeSingle()
  if (!profile?.organization_id) {
    return NextResponse.json({ error: "no_organization" }, { status: 400 })
  }

  const [{ data: clients }, { data: jobRows }] = await Promise.all([
    sb.from("clients")
      .select("id, name, domain, aliases, notes, created_at, updated_at")
      .order("name", { ascending: true }),
    sb.from("jobs").select("client_id").not("client_id", "is", null),
  ])

  const counts = new Map<string, number>()
  for (const j of jobRows ?? []) {
    const id = (j as { client_id: string | null }).client_id
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1)
  }

  const withCounts = (clients ?? []).map((c) => ({
    ...c,
    mission_count: counts.get(c.id) ?? 0,
  }))

  return NextResponse.json({ clients: withCounts })
}

export async function POST(req: NextRequest) {
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })
  const gate = await requireActiveAccess()
  if (!gate.ok) return gate.response

  const { data: profile } = await sb
    .from("profiles").select("organization_id").eq("user_id", user.id).maybeSingle()
  if (!profile?.organization_id) {
    return NextResponse.json({ error: "no_organization" }, { status: 400 })
  }

  const body = await req.json().catch(() => null) as
    { name?: unknown; domain?: unknown; notes?: unknown } | null
  const name = typeof body?.name === "string" ? body.name.trim() : ""
  const domain = cleanDomain(body?.domain)
  const notes = typeof body?.notes === "string" ? body.notes.trim().slice(0, 2000) || null : null
  if (!name || name.length > 160) {
    return NextResponse.json({ error: "invalid_name" }, { status: 400 })
  }

  const { data, error } = await sb
    .from("clients")
    .insert({ organization_id: profile.organization_id, name, domain, notes, created_by: user.id })
    .select("id, name, domain, aliases, notes, created_at, updated_at")
    .single()

  // 23505 = unique_violation (nom déjà présent, insensible à la casse) → on
  // renvoie l'existant pour que la création « à la volée » reste idempotente.
  if (error) {
    if (error.code === "23505") {
      const { data: existing } = await sb
        .from("clients")
        .select("id, name, domain, aliases, notes, created_at, updated_at")
        .ilike("name", name)
        .maybeSingle()
      if (existing) return NextResponse.json({ ok: true, client: existing, existed: true })
    }
    console.error("[clients] create failed:", error.message)
    return NextResponse.json({ error: "create_failed", detail: "internal_error" }, { status: 500 })
  }

  return NextResponse.json({ ok: true, client: { ...data, mission_count: 0 } })
}
