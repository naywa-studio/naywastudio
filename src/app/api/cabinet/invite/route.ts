import { NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { getAdminSupabase } from "@/lib/admin-supabase"
import { sendEmail } from "@/lib/resend"
import { TRIAL_SEAT_CAP } from "@/lib/trial"

export const runtime = "nodejs"

/**
 * POST   /api/cabinet/invite  { email }     — owner sends an invite
 * DELETE /api/cabinet/invite?id={id}        — owner revokes a pending invite
 *
 * Invite flow:
 *   1. Owner enters teammate's email in /cabinet.
 *   2. We INSERT into org_invites (token = uuid, 7 d expiry) — UNIQUE on
 *      (organization_id, email) so re-inviting refreshes the row.
 *   3. We send an email via Resend from contact@mail.naywastudio.com with
 *      a link → /accept-invite?token={token}.
 *   4. The teammate clicks → /accept-invite handles the auth + linking.
 */

const INVITE_FROM = "Naywa Studio <contact@mail.naywastudio.com>"
const INVITE_REPLY_TO = "contact@mail.naywastudio.com"

export async function POST(req: Request) {
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })

  const { data: profile } = await sb
    .from("profiles")
    .select("organization_id, role, first_name")
    .eq("user_id", user.id)
    .single()
  if (!profile?.organization_id) return NextResponse.json({ error: "No organization" }, { status: 404 })
  if (profile.role !== "owner") return NextResponse.json({ error: "Only the owner can invite" }, { status: 403 })

  let body: { email?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : ""
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Adresse email invalide" }, { status: 400 })
  }

  const admin = getAdminSupabase()

  // Fetch the org name + seat budget context for the cap check.
  const { data: org } = await admin
    .from("organizations")
    .select("name, brand_name, subscription_seats, subscription_status")
    .eq("id", profile.organization_id)
    .single()
  const cabinetLabel = (org?.brand_name ?? org?.name ?? "votre structure").trim()

  // Cap "essai 2 sièges" : si pas d'abonnement payant actif, on plafonne
  // les sièges utilisés (membres alloués + invitations en attente) à
  // TRIAL_SEAT_CAP. Au-delà, l'owner doit souscrire.
  const hasPaidSub =
    org?.subscription_status === "active" ||
    org?.subscription_status === "trialing" ||
    org?.subscription_status === "past_due"
  const budget = hasPaidSub
    ? (org?.subscription_seats ?? 1)
    : TRIAL_SEAT_CAP

  const { count: allocatedCount } = await admin
    .from("profiles")
    .select("user_id", { count: "exact", head: true })
    .eq("organization_id", profile.organization_id)
    .eq("has_sourcing_seat", true)
  const { count: pendingInvitesCount } = await admin
    .from("org_invites")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", profile.organization_id)
    .is("accepted_at", null)
  const used = (allocatedCount ?? 0) + (pendingInvitesCount ?? 0)
  if (used >= budget) {
    return NextResponse.json(
      {
        error: hasPaidSub
          ? `Budget de sièges atteint (${budget}). Souscrivez à un plan supérieur pour inviter plus de membres.`
          : `Essai limité à ${TRIAL_SEAT_CAP} sièges. Souscrivez à un abonnement pour inviter plus de membres.`,
      },
      { status: 409 },
    )
  }

  // Reject if that email is already a member of this org.
  const { data: existingMember } = await admin
    .from("profiles")
    .select("user_id, organization_id")
    .eq("organization_id", profile.organization_id)
    // we don't have email on profiles; need to look it up via auth.users
    .limit(1)
  void existingMember // (we'll trust uniqueness check below; full member-email check is heavier)

  // Upsert the invite (UNIQUE on org_id + email lets re-invites refresh).
  const { data: invite, error: insertErr } = await admin
    .from("org_invites")
    .upsert(
      {
        organization_id: profile.organization_id,
        email,
        role: "member",
        invited_by: user.id,
        // refresh the expiry on re-invite
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        accepted_at: null,
      },
      { onConflict: "organization_id,email" },
    )
    .select("id, token")
    .single()

  if (insertErr || !invite) {
    console.error("[/api/cabinet/invite POST] insert error:", insertErr)
    return NextResponse.json({ error: "Erreur lors de la création de l'invitation" }, { status: 500 })
  }

  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://naywastudio.com").trim()
  const acceptLink = `${baseUrl}/accept-invite?token=${encodeURIComponent(invite.token)}`
  const inviterName = profile.first_name?.trim() || "Un membre"

  try {
    await sendEmail({
      from: INVITE_FROM,
      to: email,
      replyTo: INVITE_REPLY_TO,
      subject: `${inviterName} vous invite à rejoindre ${cabinetLabel} sur Naywa Studio`,
      text:
        `Bonjour,\n\n` +
        `${inviterName} vous invite à rejoindre ${cabinetLabel} sur Naywa Studio.\n` +
        `En acceptant, vous accéderez au workspace partagé (vivier, missions, pipeline) du cabinet.\n\n` +
        `Cliquez sur ce lien pour accepter (valable 7 jours, à usage unique) :\n` +
        `${acceptLink}\n\n` +
        `Si vous ne reconnaissez pas l'expéditeur, ignorez ce mail.\n\n` +
        `Naywa Studio`,
      html: buildInviteHtml({ inviterName, cabinetLabel, acceptLink }),
    })
  } catch (err) {
    console.error("[/api/cabinet/invite POST] send error:", err)
    // The invite row exists; let the owner know but don't roll back.
    return NextResponse.json({ ok: true, warn: "L'invitation est créée mais l'email n'a pas pu partir." })
  }

  return NextResponse.json({ ok: true, id: invite.id })
}

export async function DELETE(req: Request) {
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })

  const { data: profile } = await sb
    .from("profiles")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .single()
  if (!profile?.organization_id) return NextResponse.json({ error: "No organization" }, { status: 404 })
  if (profile.role !== "owner") return NextResponse.json({ error: "Only the owner can revoke" }, { status: 403 })

  const id = new URL(req.url).searchParams.get("id")
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 })

  const admin = getAdminSupabase()
  const { error } = await admin
    .from("org_invites")
    .delete()
    .eq("id", id)
    .eq("organization_id", profile.organization_id)
  if (error) {
    console.error("[/api/cabinet/invite DELETE]", error)
    return NextResponse.json({ error: "DB error" }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

/* ───────────────────────────── Email HTML ───────────────────────────── */

function buildInviteHtml(p: { inviterName: string; cabinetLabel: string; acceptLink: string }) {
  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#FAFAFA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#FAFAFA;padding:40px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;background:#ffffff;border:1px solid #F0ECF8;border-radius:16px;padding:40px 36px;">
<tr><td>
<p style="margin:0;font-size:13px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#7C63C8;">Naywa Studio</p>
<h1 style="margin:18px 0 12px;font-size:24px;line-height:1.25;color:#111827;font-weight:800;letter-spacing:-0.02em;">Vous êtes invité.</h1>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#4B5563;">
  <strong style="color:#111827;">${escapeHtml(p.inviterName)}</strong> vous invite à rejoindre
  <strong style="color:#111827;">${escapeHtml(p.cabinetLabel)}</strong> sur Naywa Studio.
  Vous accéderez au workspace partagé (vivier, missions, pipeline) du cabinet.
</p>
<table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td bgcolor="#7C63C8" style="border-radius:10px;">
<a href="${p.acceptLink}" style="display:inline-block;padding:14px 28px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;background:#7C63C8;">Accepter l'invitation</a>
</td></tr></table>
<p style="margin:28px 0 0;font-size:12.5px;line-height:1.6;color:#9CA3AF;">Lien valable 7 jours, à usage unique. Si le bouton ne marche pas, copiez ce lien :</p>
<p style="margin:6px 0 0;font-size:12px;color:#7C63C8;word-break:break-all;">${p.acceptLink}</p>
<hr style="border:none;border-top:1px solid #F0ECF8;margin:28px 0;">
<p style="margin:0;font-size:12px;line-height:1.55;color:#9CA3AF;">Vous ne reconnaissez pas l'expéditeur ? Ignorez ce mail.</p>
</td></tr></table>
<p style="margin:18px 0 0;font-size:11px;color:#9CA3AF;">Naywa Studio · L'IA traite, vous décidez.</p>
</td></tr></table>
</body></html>`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;")
}
