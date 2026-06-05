import { NextResponse } from "next/server"
import { getAdminSupabase } from "@/lib/admin-supabase"

/**
 * POST /api/cabinet/decline-invite  { token }
 *
 * Public — no auth required. Just verifies the token is valid + unused
 * and deletes the row. Subsequent clicks on the link will show
 * "lien invalide ou révoqué".
 */
export async function POST(req: Request) {
  let body: { token?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

  const token = typeof body.token === "string" ? body.token : ""
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 })

  const admin = getAdminSupabase()
  const { data: invite } = await admin
    .from("org_invites")
    .select("id, accepted_at")
    .eq("token", token)
    .maybeSingle()

  if (!invite || invite.accepted_at) {
    // Idempotent — treat already-gone as success so the UI is simple.
    return NextResponse.json({ ok: true })
  }

  const { error } = await admin
    .from("org_invites")
    .delete()
    .eq("id", invite.id)
  if (error) {
    console.error("[/api/cabinet/decline-invite]", error)
    return NextResponse.json({ error: "DB error" }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
