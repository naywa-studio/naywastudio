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
import { requireActiveAccess } from "@/lib/access-guard"
import { getAdminSupabase } from "@/lib/admin-supabase"
import { consumeQuota } from "@/lib/quota"
import { sendEmail } from "@/lib/resend"
import { ensureInboxAddress, fromHeader } from "@/lib/mailing/inbox-address"
import { sendCandidateEmail } from "@/lib/mailing/send"
import { canSendFromOrgDomain } from "@/lib/subscription"

export const runtime = "nodejs"
export const maxDuration = 30

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })
  const gate = await requireActiveAccess()
  if (!gate.ok) return gate.response

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

  const { data: profile } = await admin
    .from("profiles")
    .select("first_name, inbox_cc_self, organization_id, is_admin")
    .eq("user_id", user.id)
    .single()

  const { data: org } = profile?.organization_id
    ? await admin.from("organizations").select("*").eq("id", profile.organization_id).single()
    : { data: null }

  /* ── Sous quelle identité part ce message ? ────────────────────────────
   *
   * Deux chemins, et un seul critère pour trancher : le domaine du cabinet
   * est-il RÉELLEMENT prêt (option acquise ET clés DKIM publiées) ?
   *
   *   oui  → le domaine du cabinet, via `lib/mailing`. Là, la règle est
   *          « son domaine ou rien » : aucun repli, jamais.
   *   non  → le domaine Naywa, comme depuis toujours.
   *
   * Ce n'est pas une contradiction. Un cabinet sans add-on n'a pas de
   * domaine à usurper ; un cabinet qui en a un ne doit jamais voir ses
   * messages partir sous une autre marque que la sienne.
   *
   * L'adresse de réception suit le même domaine — sans quoi le candidat
   * lirait un expéditeur au nom du cabinet et répondrait à Naywa. */
  // ⚠️ La MÊME valeur d'`isAdmin` des deux côtés. Une divergence enverrait
  // depuis le domaine du cabinet avec un `Reply-To` chez Naywa : le candidat
  // répondrait ailleurs, et tout aurait l'air de marcher.
  const asAdmin = { isAdmin: profile?.is_admin === true }
  const onOwnDomain = canSendFromOrgDomain(org, asAdmin)
  const inboxAddress = await ensureInboxAddress(admin, user.id, org, asAdmin)
  const from = fromHeader(profile?.first_name, inboxAddress)
  const bcc = profile?.inbox_cc_self ? (user.email ?? undefined) : undefined

  // Send
  let providerId: string
  try {
    if (onOwnDomain && org) {
      const sent = await sendCandidateEmail(
        {
          org,
          senderName: profile?.first_name,
          replyTo: inboxAddress,
          to: candidate.email,
          subject,
          text: messageBody,
          bcc,
        },
        asAdmin,
      )
      // Un refus ici serait une incohérence : `canSendFromOrgDomain` vient de
      // dire oui. On le traite quand même — la garde interne de l'envoi est
      // la dernière avant le candidat, et on préfère un échec explicite à un
      // message parti sous une identité imprévue.
      if (!sent.ok) throw new Error(`mailing refusé: ${sent.reason}`)
      providerId = sent.id
    } else {
      const sent = await sendEmail({
        from,
        to: candidate.email,
        replyTo: inboxAddress,
        subject,
        text: messageBody,
        bcc,
      })
      providerId = sent.id
    }
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
    return NextResponse.json({
      error: "send_failed",
      message: "L'envoi a échoué. Réessayez.",
      // La cause réelle, pour les admins Naywa uniquement. Un message de
      // fournisseur peut nommer une adresse ou une configuration interne :
      // il n'a rien à faire chez un client. Mais sans lui, diagnostiquer un
      // refus SES revient à deviner — le refus « bac à sable », notamment,
      // parle du destinataire et n'oriente vers rien.
      ...(profile?.is_admin === true ? { detail: (err as Error).message } : {}),
    }, { status: 502 })
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
