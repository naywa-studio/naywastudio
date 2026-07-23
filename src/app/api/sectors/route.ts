/**
 * GET  /api/sectors  — liste des secteurs de l'org (+ définition) + comptage de
 *                      candidats par secteur + total "à classer". SEED des
 *                      secteurs par défaut à la première visite (org vide).
 * POST /api/sectors  — crée un secteur { name, description? } (created_by='user').
 *
 * RLS org-scopée via le client server (policy `sectors_org_all`).
 */

import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { requireActiveAccess } from "@/lib/access-guard"
import { DEFAULT_SECTORS } from "@/lib/sector-defaults"

export const runtime = "nodejs"

export async function GET() {
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })

  const { data: profile } = await sb
    .from("profiles").select("organization_id").eq("user_id", user.id).maybeSingle()
  if (!profile?.organization_id) {
    return NextResponse.json({ error: "no_organization" }, { status: 400 })
  }

  // Seed à la première visite : si l'org n'a AUCUN secteur, on crée la liste
  // par défaut (avec définitions → classement Nora cohérent d'emblée).
  // Idempotent : ne seed que sur org vide, onConflict ignore les doublons.
  const { count } = await sb
    .from("sectors").select("id", { count: "exact", head: true })
  if ((count ?? 0) === 0) {
    await sb.from("sectors").upsert(
      DEFAULT_SECTORS.map((s) => ({
        organization_id: profile.organization_id,
        name: s.name,
        description: s.description,
        created_by: "nora" as const,
      })),
      { onConflict: "organization_id,name", ignoreDuplicates: true },
    )
  }

  // Comptage par secteur — paginé. Un `.select()` sans `.range()` est plafonné
  // à 1000 lignes par Supabase : au-delà, les compteurs seraient sous-évalués
  // (les plans généreux visent plusieurs milliers de CV). On boucle par pages
  // de 1000 jusqu'à épuisement.
  const counts = new Map<string, number>()
  let toReview = 0
  const PAGE = 1000
  const [{ data: sectorsRows }] = await Promise.all([
    sb.from("sectors").select("id, name, description, created_by, created_at").order("name", { ascending: true }),
    (async () => {
      for (let from = 0; ; from += PAGE) {
        const { data: rows } = await sb
          .from("candidates").select("sectors, sector_status").range(from, from + PAGE - 1)
        const page = rows ?? []
        for (const c of page) {
          const secs = (c.sectors ?? []) as string[]
          if (c.sector_status === "to_review" || secs.length === 0) toReview++
          for (const s of secs) counts.set(s, (counts.get(s) ?? 0) + 1)
        }
        if (page.length < PAGE) break
      }
    })(),
  ])

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
  const gate = await requireActiveAccess()
  if (!gate.ok) return gate.response

  const { data: profile } = await sb
    .from("profiles").select("organization_id").eq("user_id", user.id).maybeSingle()
  if (!profile?.organization_id) {
    return NextResponse.json({ error: "no_organization" }, { status: 400 })
  }

  const body = await req.json().catch(() => null) as { name?: unknown; description?: unknown } | null
  const name = typeof body?.name === "string" ? body.name.trim() : ""
  const description = typeof body?.description === "string" ? body.description.trim() || null : null
  if (!name || name.length > 60) {
    return NextResponse.json({ error: "invalid_name" }, { status: 400 })
  }

  const { data, error } = await sb
    .from("sectors")
    .insert({ organization_id: profile.organization_id, name, description, created_by: "user" })
    .select("id, name, description, created_by, created_at")
    .single()

  // 23505 = unique_violation → le secteur existe déjà, on le renvoie.
  if (error) {
    if (error.code === "23505") {
      const { data: existing } = await sb
        .from("sectors")
        .select("id, name, description, created_by, created_at")
        .eq("name", name)
        .maybeSingle()
      if (existing) return NextResponse.json({ ok: true, sector: existing, existed: true })
    }
    console.error("[sectors] create failed:", error.message)
    return NextResponse.json({ error: "create_failed", detail: "internal_error" }, { status: 500 })
  }

  return NextResponse.json({ ok: true, sector: data })
}
