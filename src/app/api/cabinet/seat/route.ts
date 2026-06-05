import { NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"

/**
 * POST /api/cabinet/seat  { allocate: boolean }
 *
 * Owner toggles their own sourcing seat:
 *   - allocate=true  → has_sourcing_seat=true, gains /workspace access
 *   - allocate=false → has_sourcing_seat=false, frees the seat
 *
 * V1 only the owner can self-toggle (members already have a seat by
 * construction — the invite that brought them in always allocated one).
 */
export async function POST(req: Request) {
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })

  // Seat allocation is owner-only. Members get their seat at invite
  // acceptance and don't toggle it themselves — if they need to leave,
  // the owner removes them from the cabinet.
  const { data: profile } = await sb
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .single()
  if (profile?.role !== "owner") {
    return NextResponse.json({ error: "Only the owner can manage seats" }, { status: 403 })
  }

  let body: { allocate?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }
  const allocate = body.allocate === true

  const { error } = await sb
    .from("profiles")
    .update({ has_sourcing_seat: allocate })
    .eq("user_id", user.id)

  if (error) {
    console.error("[/api/cabinet/seat]", error)
    return NextResponse.json({ error: "DB error" }, { status: 500 })
  }
  return NextResponse.json({ ok: true, has_sourcing_seat: allocate })
}
