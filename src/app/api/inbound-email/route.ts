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
import { getAdminSupabase } from "@/lib/admin-supabase"
import { getInboundEmail } from "@/lib/resend"
import { openrouterChat, safeJsonParse } from "@/lib/openrouter"
import type { EmailSentiment } from "@/lib/database.types"

export const runtime = "nodejs"
export const maxDuration = 30

/** Extract a bare email address from "Name <addr>" / "addr" / { address }. */
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

const ANALYSIS_PROMPT = `Tu analyses la réponse d'un candidat à un message de recrutement.
Réponds UNIQUEMENT en JSON :
{
  "sentiment": "interested" | "not_interested" | "question" | "neutral" | "negotiation",
  "summary": string,            // 1 phrase, ce que dit le candidat
  "suggested_stage": "replied" | "interview" | "rejected"
}
- "suggested_stage" : étape de pipeline suggérée. "rejected" seulement si le candidat décline clairement.
- C'est une SUGGESTION pour le sourceur, pas une décision. Sois factuel.
- Pas de markdown, JSON pur.`

const SENTIMENTS: EmailSentiment[] = ["interested", "not_interested", "question", "neutral", "negotiation"]
const SUGGESTED_STAGES = ["replied", "interview", "rejected"]

async function analyzeReply(text: string): Promise<{
  sentiment: EmailSentiment | null
  summary: string | null
  suggestedStage: string | null
}> {
  if (!text.trim()) return { sentiment: null, summary: null, suggestedStage: null }
  try {
    const res = await openrouterChat({
      model: "openai/gpt-4o-mini",
      temperature: 0.2,
      responseFormat: "json_object",
      maxTokens: 300,
      messages: [
        { role: "system", content: ANALYSIS_PROMPT },
        { role: "user", content: `Réponse du candidat :\n\n${text.slice(0, 6000)}` },
      ],
    })
    const p = safeJsonParse<Record<string, unknown>>(res.content)
    const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null)
    const sent = str(p?.sentiment)
    const stage = str(p?.suggested_stage)
    return {
      sentiment: sent && (SENTIMENTS as string[]).includes(sent) ? (sent as EmailSentiment) : "neutral",
      summary: str(p?.summary),
      suggestedStage: stage && SUGGESTED_STAGES.includes(stage) ? stage : "replied",
    }
  } catch {
    return { sentiment: null, summary: null, suggestedStage: "replied" }
  }
}

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
  const toAddr = bareAddress(data.to)
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
      bodyText = content.text
      bodyHtml = content.html
    } catch (err) {
      console.error("[inbound-email] body fetch failed:", (err as Error).message)
    }
  }

  // 2. Match: to-address → owning profile
  const { data: profile } = await admin
    .from("profiles")
    .select("user_id")
    .eq("inbox_address", toAddr)
    .maybeSingle()
  if (!profile) {
    // Not one of our addresses — acknowledge and drop.
    return NextResponse.json({ ok: true, ignored: true })
  }
  const userId = profile.user_id

  // from-address → that user's candidate
  const { data: candidate } = await admin
    .from("candidates")
    .select("id")
    .eq("user_id", userId)
    .eq("email", fromAddr)
    .limit(1)
    .maybeSingle()

  // Last outbound to this candidate carries the job context, if any.
  let jobId: string | null = null
  if (candidate) {
    const { data: lastOut } = await admin
      .from("email_messages")
      .select("job_id")
      .eq("candidate_id", candidate.id)
      .eq("direction", "outbound")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    jobId = lastOut?.job_id ?? null
  }

  // 3. LLM suggestion (never auto-applied)
  const analysis = await analyzeReply(bodyText ?? "")

  // 4. Log
  await admin.from("email_messages").insert({
    user_id: userId,
    candidate_id: candidate?.id ?? null,
    job_id: jobId,
    direction: "inbound",
    from_address: fromAddr,
    to_address: toAddr,
    subject,
    body_text: bodyText,
    body_html: bodyHtml,
    provider_id: providerId,
    status: "received",
    ai_sentiment: analysis.sentiment,
    ai_summary: analysis.summary,
    ai_suggested_stage: analysis.suggestedStage,
  })

  return NextResponse.json({ ok: true, matched: !!candidate })
}
