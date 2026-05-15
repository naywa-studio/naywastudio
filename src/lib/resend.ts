/**
 * Resend integration — outbound sending + inbox-address provisioning.
 *
 * Each client gets a dedicated sourcing address `{local}@mail.naywastudio.com`.
 * All recruitment email flows through Naywa's domain — we never touch the
 * client's personal inbox.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "./database.types"

export const MAIL_DOMAIN = "mail.naywastudio.com"
const RESEND_ENDPOINT = "https://api.resend.com/emails"

/* ─────────────────────────── Sending ─────────────────────────── */

export interface SendEmailInput {
  from: string            // "Elyas <elyas@mail.naywastudio.com>"
  to: string
  replyTo: string
  subject: string
  text: string
  html?: string
  cc?: string
  bcc?: string
}

export interface SendEmailResult {
  id: string
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const key = (process.env.RESEND_API_KEY ?? "").trim()
  if (!key) throw new Error("RESEND_API_KEY missing")

  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      from: input.from,
      to: [input.to],
      reply_to: input.replyTo,
      subject: input.subject,
      text: input.text,
      ...(input.html ? { html: input.html } : {}),
      ...(input.cc ? { cc: [input.cc] } : {}),
      ...(input.bcc ? { bcc: [input.bcc] } : {}),
    }),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => "")
    throw new Error(`Resend ${res.status}: ${detail.slice(0, 240)}`)
  }
  const data = await res.json() as { id?: string }
  if (!data.id) throw new Error("Resend: no message id returned")
  return { id: data.id }
}

/* ─────────────────────────── Receiving ─────────────────────────── */

export interface InboundEmailContent {
  text: string | null
  html: string | null
}

/**
 * Fetch the body of an inbound email. The `email.received` webhook only
 * carries metadata (from/to/subject) — the body must be retrieved here,
 * by design, to keep webhook payloads small for serverless endpoints.
 */
export async function getInboundEmail(emailId: string): Promise<InboundEmailContent> {
  const key = (process.env.RESEND_API_KEY ?? "").trim()
  if (!key) throw new Error("RESEND_API_KEY missing")

  const res = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
    headers: { Authorization: `Bearer ${key}` },
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => "")
    throw new Error(`Resend receiving ${res.status}: ${detail.slice(0, 240)}`)
  }
  const json = await res.json() as Record<string, unknown>
  // The API may return the email object directly or wrapped in `data`.
  const email = (json.data && typeof json.data === "object" ? json.data : json) as Record<string, unknown>
  return {
    text: typeof email.text === "string" ? email.text : null,
    html: typeof email.html === "string" ? email.html : null,
  }
}

/* ──────────────────── Inbox address provisioning ──────────────────── */

/** Turn a name (or email local part) into a safe email local part. */
export function slugifyLocalPart(input: string): string {
  const base = input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")   // strip accents
    .replace(/[^a-z0-9]+/g, ".")        // non-alnum → dot
    .replace(/\.+/g, ".")               // collapse dots
    .replace(/^\.+|\.+$/g, "")          // trim dots
    .slice(0, 32)
  return base || "sourceur"
}

/**
 * Returns the profile's dedicated inbox address, creating it on first use.
 * Local part derived from first_name (fallback: email local part), with a
 * numeric suffix on collision. Pass the **admin** client.
 */
export async function ensureInboxAddress(
  admin: SupabaseClient<Database>,
  userId: string,
): Promise<string> {
  const { data: profile } = await admin
    .from("profiles")
    .select("inbox_address, first_name")
    .eq("user_id", userId)
    .single()

  if (profile?.inbox_address) return profile.inbox_address

  // Seed the local part from the first name; fall back to the auth email.
  let seed = profile?.first_name?.trim() ?? ""
  if (!seed) {
    const { data: { user } } = await admin.auth.admin.getUserById(userId)
    seed = user?.email?.split("@")[0] ?? "sourceur"
  }
  const localBase = slugifyLocalPart(seed)

  // Resolve collisions: localBase, localBase2, localBase3, …
  let local = localBase
  for (let n = 2; n < 200; n++) {
    const candidate = `${local}@${MAIL_DOMAIN}`
    const { data: clash } = await admin
      .from("profiles")
      .select("user_id")
      .eq("inbox_address", candidate)
      .maybeSingle()
    if (!clash) break
    local = `${localBase}${n}`
  }
  const address = `${local}@${MAIL_DOMAIN}`

  await admin.from("profiles").update({ inbox_address: address }).eq("user_id", userId)
  return address
}

/** Build a display "From" header: `Prénom via Naywa <local@mail.naywastudio.com>`. */
export function fromHeader(firstName: string | null | undefined, address: string): string {
  const name = (firstName?.trim() || "Naywa Studio").replace(/["<>]/g, "")
  return `${name} <${address}>`
}
