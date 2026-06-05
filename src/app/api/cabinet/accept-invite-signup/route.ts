import { NextResponse } from "next/server"
import { getAdminSupabase } from "@/lib/admin-supabase"

/**
 * POST /api/cabinet/accept-invite-signup
 *   { token, first_name, password }
 *
 * Single-shot signup-from-invite: creates an auth.users row for the
 * invited email with the chosen password, the on_auth_user_created
 * trigger spins up a personal org, then we move the new profile into
 * the inviting org as a seated member and drop the personal org.
 *
 * Because the user clicked a link in their own inbox, we mark the
 * email as already confirmed — no double email confirmation needed.
 *
 * Returns { ok, email } so the client can immediately sign in with the
 * password it just chose and redirect to /workspace.
 */

const PASSWORD_MIN_LENGTH = 6
const PASSWORD_SPECIAL = /[^a-zA-Z0-9]/

export async function POST(req: Request) {
  let body: { token?: unknown; first_name?: unknown; password?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

  const token = typeof body.token === "string" ? body.token : ""
  const firstName = typeof body.first_name === "string" ? body.first_name.trim() : ""
  const password = typeof body.password === "string" ? body.password : ""

  if (!token) return NextResponse.json({ error: "Lien d'invitation manquant" }, { status: 400 })
  if (!firstName) return NextResponse.json({ error: "Le prénom est requis" }, { status: 400 })
  if (password.length < PASSWORD_MIN_LENGTH) {
    return NextResponse.json({ error: `Mot de passe trop court (min ${PASSWORD_MIN_LENGTH} caractères)` }, { status: 400 })
  }
  if (!PASSWORD_SPECIAL.test(password)) {
    return NextResponse.json({ error: "Le mot de passe doit contenir au moins un caractère spécial" }, { status: 400 })
  }

  const admin = getAdminSupabase()

  // 1. Validate the invite.
  const { data: invite } = await admin
    .from("org_invites")
    .select("id, organization_id, email, role, expires_at, accepted_at")
    .eq("token", token)
    .maybeSingle()
  if (!invite) return NextResponse.json({ error: "Lien invalide ou révoqué." }, { status: 404 })
  if (invite.accepted_at) return NextResponse.json({ error: "Cette invitation a déjà été acceptée." }, { status: 409 })
  if (new Date(invite.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: "Cette invitation a expiré." }, { status: 410 })
  }

  const email = invite.email.toLowerCase()

  // 2. Make sure no auth user already exists for this email — if one
  //    does, signup is the wrong flow, they should sign in first.
  const { data: existing } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
  const already = existing?.users.find((u) => (u.email ?? "").toLowerCase() === email)
  if (already) {
    return NextResponse.json({
      error: "Un compte existe déjà pour cet email. Connectez-vous puis acceptez l'invitation.",
      already_exists: true,
    }, { status: 409 })
  }

  // 3. Create the auth user with email already confirmed (they clicked
  //    the link in their inbox = proof of email ownership).
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { first_name: firstName },
  })
  if (createErr || !created?.user) {
    console.error("[/api/cabinet/accept-invite-signup] createUser", createErr)
    return NextResponse.json({ error: "Erreur lors de la création du compte." }, { status: 500 })
  }
  const newUserId = created.user.id

  // 4. The on_auth_user_created trigger has now inserted a profile +
  //    spun up a personal org. Pull the personal org id so we can drop
  //    it after moving the profile.
  const { data: profile } = await admin
    .from("profiles")
    .select("organization_id")
    .eq("user_id", newUserId)
    .single()
  const personalOrgId = profile?.organization_id

  // 5. Move profile to the invited org as a seated member.
  const { error: moveErr } = await admin
    .from("profiles")
    .update({
      organization_id: invite.organization_id,
      role: invite.role,
      has_sourcing_seat: true,
    })
    .eq("user_id", newUserId)
  if (moveErr) {
    console.error("[/api/cabinet/accept-invite-signup] move", moveErr)
    return NextResponse.json({ error: "Erreur lors de l'acceptation." }, { status: 500 })
  }

  // 6. Drop the now-empty personal org (cascade cleans any stray rows).
  if (personalOrgId && personalOrgId !== invite.organization_id) {
    await admin.from("organizations").delete().eq("id", personalOrgId)
  }

  // 7. Mark the invite accepted.
  await admin
    .from("org_invites")
    .update({ accepted_at: new Date().toISOString() })
    .eq("id", invite.id)

  return NextResponse.json({ ok: true, email })
}
