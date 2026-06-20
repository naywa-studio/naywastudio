/**
 * POST /api/support
 *
 * Bouton "Contactez le support" dans le workspace/organisation. Envoie
 * un mail à support.it@naywastudio.com avec :
 *   - le message saisi par le user
 *   - l'email du user (depuis sa session, pas le body)
 *   - le nom de son organisation (depuis profiles → organizations)
 *   - l'URL d'où il a déclenché le formulaire
 *   - le user-agent du navigateur
 *
 * Pas de stockage en DB pour V1 (cf. discussion produit) : c'est Elyas
 * qui traite ses mails depuis sa boîte. Si on doit monter en charge
 * plus tard, on ajoutera une table support_messages + une inbox dans
 * /admin/support (chantier `claude/support-inbox`).
 */

import { NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { getAdminSupabase } from "@/lib/admin-supabase"
import { sendEmail, MAIL_DOMAIN } from "@/lib/resend"

export const runtime = "nodejs"

const SUPPORT_INBOX = "support.it@naywastudio.com"
const SENDER_HEADER = `Naywa Studio <support@${MAIL_DOMAIN}>`

interface SupportPayload {
  message?: string
  url?: string
  userAgent?: string
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;")
}

export async function POST(req: Request) {
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 })
  }

  let body: SupportPayload
  try {
    body = (await req.json()) as SupportPayload
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 })
  }

  const message = (body.message ?? "").trim()
  if (!message) return NextResponse.json({ error: "message_required" }, { status: 400 })
  if (message.length > 5000) return NextResponse.json({ error: "message_too_long" }, { status: 400 })

  const url = typeof body.url === "string" ? body.url.slice(0, 500) : ""
  const userAgent = typeof body.userAgent === "string" ? body.userAgent.slice(0, 500) : ""

  // Contexte org : on récupère le nom + le first_name côté admin
  // (évite les jointures avec RLS).
  const admin = getAdminSupabase()
  const { data: profile } = await admin
    .from("profiles")
    .select(`
      first_name, organization_id,
      organizations:organization_id ( name, brand_name )
    `)
    .eq("user_id", user.id)
    .maybeSingle()
  const orgRaw = (profile as unknown as { organizations: unknown })?.organizations
  const org = Array.isArray(orgRaw) ? orgRaw[0] : orgRaw
  const orgName = (org as { brand_name?: string | null; name?: string })?.brand_name
    ?? (org as { name?: string })?.name
    ?? "(sans nom)"

  const userEmail = user.email ?? "(email inconnu)"
  const firstName = profile?.first_name ?? "(prénom inconnu)"

  const safeMessage = escapeHtml(message).replace(/\n/g, "<br />")

  const text = [
    `Nouveau message support`,
    ``,
    `De : ${firstName} <${userEmail}>`,
    `Organisation : ${orgName}`,
    `URL : ${url || "(non renseignée)"}`,
    `User-agent : ${userAgent || "(non renseigné)"}`,
    ``,
    `---`,
    ``,
    message,
  ].join("\n")

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; color:#111827;">
      <p style="margin:0 0 12px; font-size:12px; color:#7C63C8; letter-spacing:.08em; text-transform:uppercase; font-weight:700;">
        Nouveau message support
      </p>
      <table style="border-collapse: collapse; margin: 0 0 18px; font-size:13px; color:#374151;">
        <tr><td style="padding:2px 12px 2px 0; font-weight:600;">De</td><td>${escapeHtml(firstName)} &lt;${escapeHtml(userEmail)}&gt;</td></tr>
        <tr><td style="padding:2px 12px 2px 0; font-weight:600;">Organisation</td><td>${escapeHtml(orgName)}</td></tr>
        <tr><td style="padding:2px 12px 2px 0; font-weight:600;">URL</td><td>${escapeHtml(url || "(non renseignée)")}</td></tr>
        <tr><td style="padding:2px 12px 2px 0; font-weight:600;">User-agent</td><td style="font-family:ui-monospace,monospace; font-size:11.5px; color:#6B7280;">${escapeHtml(userAgent || "(non renseigné)")}</td></tr>
      </table>
      <hr style="border:none; border-top:1px solid #E2DAF6; margin:18px 0;" />
      <div style="font-size:14.5px; line-height:1.65;">${safeMessage}</div>
      <hr style="border:none; border-top:1px solid #E2DAF6; margin:24px 0;" />
      <p style="margin:0; font-size:12px; color:#9CA3AF;">
        Répondez à ce message pour écrire à ${escapeHtml(userEmail)}.
      </p>
    </div>
  `.trim()

  try {
    await sendEmail({
      from:    SENDER_HEADER,
      to:      SUPPORT_INBOX,
      replyTo: userEmail,
      subject: `[Support] ${firstName} — ${orgName}`,
      text,
      html,
    })
  } catch (err) {
    console.error("[support] resend send failed", err)
    return NextResponse.json(
      { error: "Impossible d'envoyer le message pour le moment" },
      { status: 502 },
    )
  }

  return NextResponse.json({ ok: true })
}
