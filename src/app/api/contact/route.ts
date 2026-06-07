/**
 * POST /api/contact
 *
 * Public marketing-site contact form. Sends the message to
 * `contact@naywastudio.com` via Resend, with `reply_to` set to the
 * visitor's email so a single click on Reply lands back in their inbox.
 *
 * Anti-spam : light client-side heuristics + a sub-second submission gate.
 * No turnstile / captcha yet — overkill for current traffic. We'll
 * bolt one on when scrapers actually find the endpoint.
 */

import { NextResponse } from "next/server"
import { sendEmail, MAIL_DOMAIN } from "@/lib/resend"

export const runtime = "nodejs"

const CONTACT_INBOX = "contact@naywastudio.com"
// Outbound sender lives on the verified subdomain — root @naywastudio.com
// is Google Workspace and not authorised for Resend sends.
const SENDER_HEADER = `Naywa Studio <contact@${MAIL_DOMAIN}>`

interface ContactPayload {
  name?: string
  email?: string
  subject?: string
  message?: string
}

function badRequest(error: string) {
  return NextResponse.json({ error }, { status: 400 })
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

export async function POST(req: Request) {
  let body: ContactPayload
  try {
    body = (await req.json()) as ContactPayload
  } catch {
    return badRequest("JSON invalide")
  }

  const name    = (body.name    ?? "").trim()
  const email   = (body.email   ?? "").trim()
  const subject = (body.subject ?? "").trim()
  const message = (body.message ?? "").trim()

  if (!name)    return badRequest("Le nom est requis")
  if (!email || !isValidEmail(email)) return badRequest("Email invalide")
  if (!subject) return badRequest("L'objet est requis")
  if (!message) return badRequest("Le message est requis")

  // Length guardrails — block obviously spammy payloads.
  if (name.length    > 120)   return badRequest("Nom trop long")
  if (subject.length > 200)   return badRequest("Objet trop long")
  if (message.length > 5000)  return badRequest("Message trop long")

  const safeName    = escapeHtml(name)
  const safeEmail   = escapeHtml(email)
  const safeSubject = escapeHtml(subject)
  const safeMessage = escapeHtml(message).replace(/\n/g, "<br />")

  const text = [
    `Nouveau message depuis naywastudio.com/contact`,
    ``,
    `De : ${name} <${email}>`,
    `Objet : ${subject}`,
    ``,
    `---`,
    ``,
    message,
  ].join("\n")

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; color:#111827;">
      <p style="margin:0 0 12px; font-size:12px; color:#7C63C8; letter-spacing:.08em; text-transform:uppercase; font-weight:700;">
        Nouveau message — formulaire de contact
      </p>
      <h2 style="margin:0 0 16px; font-size:20px; font-weight:700;">${safeSubject}</h2>
      <p style="margin:0 0 6px; font-size:14px;"><strong>De :</strong> ${safeName} &lt;${safeEmail}&gt;</p>
      <hr style="border:none; border-top:1px solid #E2DAF6; margin:20px 0;" />
      <div style="font-size:14.5px; line-height:1.7;">${safeMessage}</div>
      <hr style="border:none; border-top:1px solid #E2DAF6; margin:24px 0;" />
      <p style="margin:0; font-size:12px; color:#9CA3AF;">
        Répondez à ce message pour écrire directement à ${safeEmail}.
      </p>
    </div>
  `.trim()

  try {
    await sendEmail({
      from:    SENDER_HEADER,
      to:      CONTACT_INBOX,
      replyTo: email,
      subject: `[Contact] ${subject}`,
      text,
      html,
    })
  } catch (err) {
    console.error("[contact] resend send failed", err)
    return NextResponse.json(
      { error: "Impossible d'envoyer le message pour le moment" },
      { status: 502 },
    )
  }

  return NextResponse.json({ ok: true })
}
