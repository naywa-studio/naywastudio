/**
 * PATCH  /api/clients/[id] — met à jour un client (name, domain, notes, aliases).
 * DELETE /api/clients/[id] — supprime un client. Les missions rattachées sont
 *                            détachées (jobs.client_id → NULL via FK).
 *
 * Tout siège actif (requireActiveAccess). RLS org-scopée : un id d'une autre
 * org est ignoré (0 ligne touchée). Field-allowlist sur le PATCH.
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

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })
  const gate = await requireActiveAccess()
  if (!gate.ok) return gate.response

  const { id } = await params
  const body = await req.json().catch(() => null) as
    { name?: unknown; domain?: unknown; notes?: unknown; aliases?: unknown } | null
  if (!body) return NextResponse.json({ error: "invalid_body" }, { status: 400 })

  // Field-allowlist : on ne construit que les champs autorisés (jamais de spread).
  const patch: { name?: string; domain?: string | null; notes?: string | null; aliases?: string[] } = {}
  if (typeof body.name === "string") {
    const name = body.name.trim()
    if (!name || name.length > 160) return NextResponse.json({ error: "invalid_name" }, { status: 400 })
    patch.name = name
  }
  if ("domain" in body) patch.domain = cleanDomain(body.domain)
  if ("notes" in body) {
    patch.notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 2000) || null : null
  }
  if (Array.isArray(body.aliases)) {
    patch.aliases = body.aliases
      .filter((a): a is string => typeof a === "string")
      .map((a) => a.trim())
      .filter((a) => a.length > 0 && a.length <= 160)
      .slice(0, 20)
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "no_fields" }, { status: 400 })
  }

  const { data, error } = await sb
    .from("clients")
    .update(patch)
    .eq("id", id)
    .select("id, name, domain, aliases, notes, created_at, updated_at")
    .maybeSingle()

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "duplicate_name" }, { status: 409 })
    }
    console.error("[clients] update failed:", error.message)
    return NextResponse.json({ error: "update_failed", detail: "internal_error" }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 })

  return NextResponse.json({ ok: true, client: data })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })
  const gate = await requireActiveAccess()
  if (!gate.ok) return gate.response

  const { id } = await params
  const { error } = await sb.from("clients").delete().eq("id", id)
  if (error) {
    console.error("[clients] delete failed:", error.message)
    return NextResponse.json({ error: "delete_failed", detail: "internal_error" }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
