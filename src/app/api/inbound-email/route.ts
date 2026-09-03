/**
 * POST /api/inbound-email   — Resend inbound webhook.
 *
 * Fires when a candidate replies to a client's Naywa address. We:
 *   1. Verify the Svix signature (RESEND_WEBHOOK_SECRET).
 *   2. Match the message: `to` → profile.inbox_address → user;
 *      `from` → that user's candidate with the same email.
 *   3. Log it to email_messages (direction inbound).
 *   4. Ask the LLM for a SUGGESTION (sentiment + summary + suggested stage).
 *      Nothing is auto-applied — the inbound email content is untrusted,
 *      so the user must approve any pipeline move from the UI.
 *
 * Also tracks delivery/bounce events for our outbound messages.
 */

import { NextRequest, NextResponse } from "next/server"
import { Webhook } from "svix"
import { resolveInboundRouting, stripQuotedReply } from "@/lib/mailing/route-inbound"
import { getAdminSupabase } from "@/lib/admin-supabase"
import { getInboundEmail } from "@/lib/resend"
import { analyzeReply } from "@/lib/mailing/analyze-reply"

export const runtime = "nodejs"
export const maxDuration = 30

/** Extract a bare email address from "Name <addr>" / "addr" / { address }. */
/**
 * TOUTES les adresses d'un champ, pas seulement la première.
 *
 * ⚠️ Cette fonction ne lisait que `v[0]`, et ça devenait faux dès qu'un
 * message avait plusieurs destinataires — c'est-à-dire dès qu'on pose un
 * `Reply-To` à deux adresses (celle du sourceur, la nôtre). Le candidat
 * répond, sa messagerie remplit les deux, la PREMIÈRE est celle du sourceur…
 * qui ne correspond à aucun profil. La réponse serait alors jetée en silence,
 * et le sourceur conclurait que son candidat ne répond pas.
 */
function allAddresses(v: unknown): string[] {
  if (!v) return []
  if (Array.isArray(v)) return v.flatMap(allAddresses)
  if (typeof v === "object") {
    const o = v as Record<string, unknown>
    return allAddresses(o.address ?? o.email ?? o.value)
  }
  if (typeof v !== "string") return []
  // Un champ d'en-tête peut porter plusieurs adresses séparées par des
  // virgules, y compris à l'intérieur d'une seule chaîne.
  return v.split(",").map((part) => {
    const m = part.match(/<([^>]+)>/)
    const addr = (m ? m[1] : part).trim().toLowerCase()
    return addr.includes("@") ? addr : ""
  }).filter(Boolean)
}

function bareAddress(v: unknown): string | null {
  if (!v) return null
  if (Array.isArray(v)) return bareAddress(v[0])
  if (typeof v === "object") {
    const o = v as Record<string, unknown>
    return bareAddress(o.address ?? o.email ?? o.value)
  }
  if (typeof v !== "string") return null
  const m = v.match(/<([^>]+)>/)
  const addr = (m ? m[1] : v).trim().toLowerCase()
  return addr.includes("@") ? addr : null
}

/*
 * `stripQuotedReply` vit désormais dans `lib/mailing/route-inbound.ts`, partagé
 * avec la réception par le domaine du client (SES). Les deux chemins doivent
 * découper les citations de la même façon : une divergence donnerait des
 * corps de message différents selon le fournisseur, donc des analyses et un
 * affichage différents pour un même échange.
 */

/*
 * `analyzeReply` vit désormais dans `lib/mailing/analyze-reply.ts`, appelé par
 * les DEUX chemins de réception. Il n'était appelé que d'ici : une réponse
 * arrivée sur le domaine du cabinet repartait donc sans sentiment, sans résumé
 * et sans étape suggérée — silencieusement.
 */

export async function POST(req: NextRequest) {
  const secret = (process.env.RESEND_WEBHOOK_SECRET ?? "").trim()
  if (!secret) {
    console.error("[inbound-email] RESEND_WEBHOOK_SECRET missing")
    return NextResponse.json({ error: "not_configured" }, { status: 500 })
  }

  // 1. Verify signature
  const raw = await req.text()
  let evt: unknown
  try {
    const wh = new Webhook(secret)
    evt = wh.verify(raw, {
      "svix-id": req.headers.get("svix-id") ?? "",
      "svix-timestamp": req.headers.get("svix-timestamp") ?? "",
      "svix-signature": req.headers.get("svix-signature") ?? "",
    })
  } catch {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 })
  }

  const event = evt as { type?: string; data?: Record<string, unknown> }
  const type = event.type ?? ""
  const data = event.data ?? {}
  const admin = getAdminSupabase()

  // ── Delivery / bounce tracking for our OUTBOUND messages ──
  if (type === "email.delivered" || type === "email.bounced" || type === "email.delivery_delayed") {
    const providerId = typeof data.email_id === "string" ? data.email_id
      : typeof data.id === "string" ? data.id : null
    if (providerId) {
      const status = type === "email.bounced" ? "bounced" : "delivered"
      await admin.from("email_messages")
        .update({ status })
        .eq("provider_id", providerId)
        .eq("direction", "outbound")
    }
    return NextResponse.json({ ok: true })
  }

  // ── Inbound email received ──
  // Resend's inbound event type may vary ("email.received" / "inbound.email…");
  // we treat anything that isn't a known delivery event and carries from/to
  // as an inbound message.
  const fromAddr = bareAddress(data.from)
  // Toutes les adresses destinataires, la nôtre n'étant pas forcément la
  // première — cf. l'avertissement sur `allAddresses`.
  const toCandidates = [...allAddresses(data.to), ...allAddresses(data.cc)]
  const toAddr = toCandidates[0] ?? null
  if (!fromAddr || !toAddr) {
    // Unknown event shape — acknowledge so Resend doesn't retry forever.
    return NextResponse.json({ ok: true, ignored: true })
  }

  const subject = typeof data.subject === "string" ? data.subject : null
  const providerId = typeof data.email_id === "string" ? data.email_id
    : typeof data.id === "string" ? data.id : null

  // The webhook carries metadata only — fetch the body separately.
  let bodyText: string | null = null
  let bodyHtml: string | null = null
  if (providerId) {
    try {
      const content = await getInboundEmail(providerId)
      bodyText = content.text ? stripQuotedReply(content.text) : null
      bodyHtml = content.html
    } catch (err) {
      console.error("[inbound-email] body fetch failed:", (err as Error).message)
    }
  }

  // 2. Rattachement — MUTUALISÉ avec la réception SES (`lib/mailing`).
  //
  // Les deux chemins de réception coexistent pendant la transition et doivent
  // rattacher à l'identique. Cette logique était dupliquée ici ; deux copies
  // finissent par diverger, et la divergence est muette — un message rattaché
  // au mauvais candidat ressemble à un message qui n'est jamais arrivé.
  /* On essaie CHAQUE destinataire jusqu'à en trouver un qui soit une de nos
   * adresses. Un message adressé à la fois au sourceur et à nous doit être
   * rattaché par la nôtre, quelle que soit sa position dans l'en-tête. */
  let routing = await resolveInboundRouting(admin, { toAddress: toAddr, fromAddress: fromAddr, subject })
  let matchedTo = toAddr
  for (const addr of toCandidates.slice(1)) {
    if (routing.userId && routing.organizationId) break
    routing = await resolveInboundRouting(admin, { toAddress: addr, fromAddress: fromAddr, subject })
    matchedTo = addr
  }
  if (!routing.userId || !routing.organizationId) {
    // Not one of our addresses — acknowledge and drop.
    return NextResponse.json({ ok: true, ignored: true })
  }
  const userId = routing.userId
  const jobId = routing.jobId

  // 3. LLM suggestion (never auto-applied)
  const analysis = await analyzeReply(bodyText ?? "", routing.organizationId, { isAdmin: routing.isAdmin })

  // 4. Log
  await admin.from("email_messages").insert({
    user_id: userId,
    candidate_id: routing.candidateId,
    job_id: jobId,
    direction: "inbound",
    from_address: fromAddr,
    to_address: matchedTo,
    subject,
    body_text: bodyText,
    body_html: bodyHtml,
    provider_id: providerId,
    status: "received",
    ai_sentiment: analysis.sentiment,
    ai_summary: analysis.summary,
    ai_suggested_stage: analysis.suggestedStage,
  })

  return NextResponse.json({ ok: true, matched: !!routing.candidateId })
}
