import { NextResponse, type NextRequest } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"

/**
 * POST /api/booking/confirm
 * Body: { token: string, status: "reserved" | "done" }
 *
 * Allows external webhooks (e.g. Calendly) to update booking status.
 * For now also used for manual updates from the workspace.
 * The token acts as the auth mechanism — no additional secret required for Phase 1.
 */
export async function POST(request: NextRequest) {
  let body: { token?: string; status?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const { token, status } = body

  if (!token || !["reserved", "done", "pending"].includes(status ?? "")) {
    return NextResponse.json(
      { error: "token and status (pending | reserved | done) are required" },
      { status: 400 }
    )
  }

  const sb = await createSupabaseServerClient()

  const { data, error } = await sb
    .from("booking_links")
    .update({ status: status as "pending" | "reserved" | "done" })
    .eq("token", token)
    .select("id, status")
    .single()

  if (error || !data) {
    return NextResponse.json({ error: "Booking link not found" }, { status: 404 })
  }

  return NextResponse.json({ ok: true, id: data.id, status: data.status })
}
