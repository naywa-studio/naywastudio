/**
 * POST /api/cv/:id/send   { subject, body, job_id? }
 *
 * Sends an outreach email to a candidate from the client's dedicated
 * Naywa address. Triggered by an explicit "Envoyer" click — that click
 * IS the user's approval. Nothing is ever sent without it.
 *
 *   1. Auth + load candidate (must have an email)
 *   2. Daily send quota
 *   3. Provision / fetch the client's inbox address
 *   4. Send via Resend (BCC the client's personal email if opted in)
 *   5. Log to email_messages (outbound)
 *   6. If a job is linked, advance that pipeline stage identified → contacted
 */

import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { getAdminSupabase } from "@/lib/admin-supabase"
import { consumeQuota } from "@/lib/quota"
import { sendEmail, ensureInboxAddress, fromHeader } from "@/lib/resend"

export const runtime = "nodejs"
export const maxDuration = 30

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })

  const body = await req.json().catch(() => null) as {
    subject?: unknown; body?: unknown; job_id?: unknown
  } | null
  const subject = typeof body?.subject === "string" ? body.subject.trim() : ""
  const messageBody = typeof body?.body === "string" ? body.body.trim() : ""
  const jobId = typeof body?.job_id === "string" ? body.job_id : null
  if (!subject || !messageBody) {
    return NextResponse.json({ error: "missing_content", message: "Objet et message requis." }, { status: 400 })
  }

  // Candidate (RLS-scoped — 404 if not the caller's)
  const { data: candidate, error } = await sb
    .from("candidates")
    .select("id, user_id, full_name, email")
    .eq("id", id)
    .single()
  if (error || !candidate) return NextResponse.json({ error: "not_found" }, { status: 404 })
  if (!candidate.email) {
    return NextResponse.json(
      { error: "no_email", message: "Ce candidat n'a pas d'adresse email, impossible de lui écrire." },
      { status: 400 },
    )
  }

  const admin = getAdminSupabase()

  const quota = await consumeQuota(admin, user.id, "send")
  if (!quota.ok) {
    return NextResponse.json({ error: "quota_exceeded", message: quota.message }, { status: 429 })
  }

  // Client's dedicated address + profile context
  const inboxAddress = await ensureInboxAddress(admin, user.id)
  const { data: profile } = await admin
    .from("profiles")
    .select("first_name, inbox_cc_self")
    .eq("user_id", user.id)
    .single()

  const from = fromHeader(profile?.first_name, inboxAddress)
  const bcc = profile?.inbox_cc_self ? (user.email ?? undefined) : undefined

  // Send
  let providerId: string
  try {
    const sent = await sendEmail({
      from,
      to: candidate.email,
      replyTo: inboxAddress,
      subject,
      text: messageBody,
      bcc,
    })
    providerId = sent.id
  } catch (err) {
    // Log the failure so the thread shows it.
    await admin.from("email_messages").insert({
      user_id: user.id,
      candidate_id: candidate.id,
      job_id: jobId,
      direction: "outbound",
      from_address: inboxAddress,
      to_address: candidate.email,
      subject,
      body_text: messageBody,
      status: "failed",
      error: (err as Error).message,
    })
    return NextResponse.json(
      { error: "send_failed", message: "L'envoi a échoué. Réessayez." },
      { status: 502 },
    )
  }

  // Log the sent message
  const { data: logged } = await admin
    .from("email_messages")
    .insert({
      user_id: user.id,
      candidate_id: candidate.id,
      job_id: jobId,
      direction: "outbound",
      from_address: inboxAddress,
      to_address: candidate.email,
      subject,
      body_text: messageBody,
      provider_id: providerId,
      status: "sent",
    })
    .select("*")
    .single()

  // Advance the pipeline stage for the linked job, if still at "identified".
  if (jobId) {
    const { data: assessment } = await admin
      .from("match_assessments")
      .select("id, pipeline_stage, contacted_at")
      .eq("candidate_id", candidate.id)
      .eq("job_id", jobId)
      .maybeSingle()
    if (assessment && assessment.pipeline_stage === "identified") {
      // Envoyer un email = contact effectif → "Contacté" ET entrée auto dans
      // la pipeline (in_pipeline).
      await admin.from("match_assessments").update({
        pipeline_stage: "contacted",
        in_pipeline: true,
        contacted_at: assessment.contacted_at ?? new Date().toISOString(),
      }).eq("id", assessment.id)
    } else if (assessment) {
      // Déjà au-delà de "identified" — on garantit juste qu'il est suivi.
      await admin.from("match_assessments").update({ in_pipeline: true }).eq("id", assessment.id)
    }
  }

  return NextResponse.json({ ok: true, message: logged })
}
