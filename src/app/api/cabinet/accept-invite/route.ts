import { NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { getAdminSupabase } from "@/lib/admin-supabase"

/**
 * POST /api/cabinet/accept-invite  { token }
 *
 * Server-side acceptance flow. Caller must already be authenticated.
 *   1. Validate token: exists, not expired, not yet accepted
 *   2. Verify the invite's email matches the caller's auth email (case-i.)
 *   3. Move the caller's profile from their personal org → the invited org
 *   4. Delete the now-empty personal org (cascade removes any leftover data)
 *   5. Mark the invite as accepted
 *
 * Returns the joined organization_id so the client can redirect to /workspace.
 */

export async function POST(req: Request) {
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })

  let body: { token?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }
  const token = typeof body.token === "string" ? body.token : ""
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 })

  const admin = getAdminSupabase()

  // 1. Validate token.
  const { data: invite } = await admin
    .from("org_invites")
    .select("id, organization_id, email, role, expires_at, accepted_at")
    .eq("token", token)
    .maybeSingle()

  if (!invite) {
    return NextResponse.json({ error: "Lien invalide ou révoqué." }, { status: 404 })
  }
  if (invite.accepted_at) {
    return NextResponse.json({ error: "Cette invitation a déjà été acceptée." }, { status: 409 })
  }
  if (new Date(invite.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: "Cette invitation a expiré." }, { status: 410 })
  }

  // 2. Email match (case-insensitive).
  const callerEmail = (user.email ?? "").toLowerCase()
  if (callerEmail !== invite.email.toLowerCase()) {
    return NextResponse.json({
      error: `Cette invitation est pour ${invite.email}. Connectez-vous avec cette adresse pour l'accepter.`,
    }, { status: 403 })
  }

  // 3. Find caller's current (personal) org id BEFORE moving.
  const { data: profile } = await admin
    .from("profiles")
    .select("organization_id")
    .eq("user_id", user.id)
    .single()
  const personalOrgId = profile?.organization_id

  // Move profile to invited org as a member, with a sourcing seat (the
  // whole point of being invited).
  const { error: moveErr } = await admin
    .from("profiles")
    .update({
      organization_id: invite.organization_id,
      role: invite.role,
      has_sourcing_seat: true,
    })
    .eq("user_id", user.id)

  if (moveErr) {
    console.error("[/api/cabinet/accept-invite] move error:", moveErr)
    return NextResponse.json({ error: "Erreur lors de l'acceptation." }, { status: 500 })
  }

  // 4. Drop the empty personal org (cascade cleans up any stray rows the
  //    caller may have created in it before accepting).
  if (personalOrgId && personalOrgId !== invite.organization_id) {
    await admin.from("organizations").delete().eq("id", personalOrgId)
  }

  // 5. Mark invite accepted.
  await admin
    .from("org_invites")
    .update({ accepted_at: new Date().toISOString() })
    .eq("id", invite.id)

  return NextResponse.json({ ok: true, organization_id: invite.organization_id })
}

/**
 * GET /api/cabinet/accept-invite?token={token}
 * Public endpoint — returns the org preview shown on /accept-invite so the
 * user knows what they're joining even before signing in.
 */
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? ""
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 })

  const admin = getAdminSupabase()
  const { data: invite } = await admin
    .from("org_invites")
    .select("organization_id, email, expires_at, accepted_at")
    .eq("token", token)
    .maybeSingle()

  if (!invite) return NextResponse.json({ error: "not_found" }, { status: 404 })
  if (invite.accepted_at) return NextResponse.json({ error: "already_accepted" }, { status: 409 })
  if (new Date(invite.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: "expired" }, { status: 410 })
  }

  const { data: org } = await admin
    .from("organizations")
    .select("name, brand_name")
    .eq("id", invite.organization_id)
    .single()

  return NextResponse.json({
    email: invite.email,
    organization_name: org?.brand_name ?? org?.name ?? "un cabinet",
    expires_at: invite.expires_at,
  })
}
