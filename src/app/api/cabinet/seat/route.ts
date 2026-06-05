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
