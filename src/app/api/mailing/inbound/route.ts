/**
 * POST /api/mailing/inbound
 *
 * Reçoit les notifications d'Amazon SNS annonçant un email entrant déposé par
 * SES. Point d'entrée PUBLIC — aucune session, aucun cookie : c'est AWS qui
 * appelle. La seule chose qui le protège est la vérification de signature.
 *
 * ── Deux contrôles, pas un ───────────────────────────────────────────────
 *
 * 1. LA SIGNATURE prouve que le message vient bien de SNS.
 *
 * 2. LA RUBRIQUE (`TopicArn`) prouve qu'il vient de NOTRE rubrique. Ce second
 *    contrôle est celui qu'on oublie, et son absence suffit à tout annuler :
 *    n'importe qui peut créer une rubrique SNS chez lui, y abonner cette URL,
 *    et publier des messages. Ils seraient **réellement signés par Amazon**,
 *    donc acceptés par le premier contrôle. Sans le second, un tiers injecte
 *    de fausses réponses de candidats dans les fils de vos clients.
 *
 * ── Pourquoi on répond 200 même en cas d'erreur métier ───────────────────
 *
 * SNS retente sur tout code non-2xx, pendant des heures. Un message qu'on ne
 * sait pas traiter — destinataire inconnu, format inattendu — ne s'améliorera
 * pas au troisième essai : on l'accuse, on le journalise, on passe. Seules les
 * pannes réellement transitoires méritent un échec.
 *
 * Une signature invalide, en revanche, répond 403 : c'est un refus, pas une
 * erreur de traitement.
 */

import { NextRequest, NextResponse } from "next/server"
import { verifySnsMessage, isTrustedCertUrl, type SnsMessage } from "@/lib/mailing/sns"
import { fetchRawEmail, parseInboundEmail, deleteRawEmail } from "@/lib/mailing/inbound"
import { resolveInboundRouting, stripQuotedReply } from "@/lib/mailing/route-inbound"
import { storeInboundAttachments } from "@/lib/mailing/attachments"
import { analyzeReply } from "@/lib/mailing/analyze-reply"
import { getAdminSupabase } from "@/lib/admin-supabase"

export const runtime = "nodejs"
// S3, MIME, recopie R2 puis lecture par Nora : le défaut de 10 s ne suffit pas
// pour un message chargé. La coupure serveur produirait un 500, donc une
// nouvelle tentative de SNS — que l'insertion idempotente absorbe, mais autant
// ne pas la provoquer.
export const maxDuration = 60

/** Rubrique(s) SNS autorisée(s), séparées par des virgules. */
function allowedTopics(): string[] {
  return (process.env.AWS_SNS_INBOUND_TOPIC_ARN ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
}

export async function POST(req: NextRequest) {
  const raw = await req.text()

  let msg: SnsMessage
  try {
    msg = JSON.parse(raw) as SnsMessage
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 })
  }

  const verdict = await verifySnsMessage(msg)
  if (!verdict.ok) {
    // Journalisé sans le corps : une requête forgée peut contenir n'importe
    // quoi, et l'écrire dans les journaux serait un second problème.
    console.error("[mailing/inbound] signature refusée:", verdict.reason)
    return NextResponse.json({ error: "invalid_signature" }, { status: 403 })
  }

  // Second contrôle : la rubrique. Une signature valide ne dit RIEN de
  // l'origine du contenu — seulement qu'AWS l'a relayé.
  const topics = allowedTopics()
  if (topics.length === 0) {
    console.error("[mailing/inbound] AWS_SNS_INBOUND_TOPIC_ARN absente — refus par défaut")
    return NextResponse.json({ error: "topic_not_configured" }, { status: 403 })
  }
  if (!msg.TopicArn || !topics.includes(msg.TopicArn)) {
    console.error("[mailing/inbound] rubrique inattendue:", msg.TopicArn)
    return NextResponse.json({ error: "unexpected_topic" }, { status: 403 })
  }

  /* ── Confirmation d'abonnement ─────────────────────────────────────────
   *
   * AWS envoie ce message une fois, à la création de l'abonnement. Le
   * confirmer revient à visiter `SubscribeURL`. On revérifie que cette URL
   * appartient bien à AWS : c'est une URL fournie DANS le message, donc à
   * traiter avec la même méfiance que `SigningCertURL`. */
  if (msg.Type === "SubscriptionConfirmation") {
    if (!msg.SubscribeURL || !isTrustedCertUrl(msg.SubscribeURL)) {
      console.error("[mailing/inbound] SubscribeURL non fiable")
      return NextResponse.json({ error: "untrusted_subscribe_url" }, { status: 403 })
    }
    try {
      const res = await fetch(msg.SubscribeURL)
      console.info("[mailing/inbound] abonnement confirmé:", res.status, msg.TopicArn)
    } catch (err) {
      // Là, un échec EST transitoire : AWS retentera, et on veut qu'il le fasse.
      console.error("[mailing/inbound] confirmation impossible:", err)
      return NextResponse.json({ error: "confirm_failed" }, { status: 500 })
    }
    return NextResponse.json({ ok: true, confirmed: true })
  }

  if (msg.Type !== "Notification") {
    // UnsubscribeConfirmation, ou un type futur : accusé sans traitement.
    console.info("[mailing/inbound] type ignoré:", msg.Type)
    return NextResponse.json({ ok: true, ignored: msg.Type })
  }

  /* ── Notification d'email entrant ──────────────────────────────────────── */
  try {
    const payload = JSON.parse(msg.Message ?? "{}") as {
      notificationType?: string
      mail?: { messageId?: string; source?: string; destination?: string[] }
      receipt?: { recipients?: string[]; action?: { type?: string; bucketName?: string; objectKey?: string } }
    }

    const recipients = payload.receipt?.recipients ?? payload.mail?.destination ?? []
    const objectKey = payload.receipt?.action?.objectKey ?? null

    if (!objectKey) {
      // Pas d'objet S3 : la règle de réception n'a pas la bonne action. Rien
      // à retenter — on accuse pour ne pas boucler, et on trace fort.
      console.error("[mailing/inbound] notification sans objectKey", { recipients })
      return NextResponse.json({ ok: true, ignored: "no_object" })
    }

    const raw = await fetchRawEmail(objectKey)
    const email = await parseInboundEmail(raw)

    if (!email.fromAddress) {
      console.error("[mailing/inbound] message sans expéditeur exploitable", { objectKey })
      return NextResponse.json({ ok: true, ignored: "no_sender" })
    }

    // Le destinataire retenu est celui que SES a réellement accepté, pas le
    // premier de l'en-tête `To` : un message peut être adressé à plusieurs
    // personnes, et seule l'adresse qui nous concerne doit décider du
    // rattachement.
    const target = (recipients[0] ?? email.to[0] ?? "").toLowerCase()

    const admin = getAdminSupabase()
    const routing = await resolveInboundRouting(admin, {
      toAddress: target,
      fromAddress: email.fromAddress,
      subject: email.subject,
    })

    if (!routing.userId || !routing.organizationId) {
      // Adresse qui ne correspond à aucun sourceur. On ne stocke rien : ce
      // n'est pas notre courrier. Tracé pour distinguer « personne ne l'a
      // reçu » de « la réception est en panne ».
      console.warn("[mailing/inbound] destinataire inconnu, message ignoré", {
        target, from: email.fromAddress,
      })
      await deleteRawEmail(objectKey)
      return NextResponse.json({ ok: true, ignored: "unknown_recipient" })
    }

    const bodyText = stripQuotedReply(email.text)

    // Les pièces jointes sont recopiées sur R2 AVANT l'écriture du message :
    // l'inverse laisserait, en cas d'échec, un message annonçant des fichiers
    // qui n'existent nulle part. Mieux vaut un message sans pièce jointe qu'un
    // message qui promet un CV introuvable.
    const attachments = email.attachments.length > 0
      ? await storeInboundAttachments(admin, {
          organizationId: routing.organizationId,
          messageKey: (payload.mail?.messageId ?? objectKey).replace(/[^a-zA-Z0-9_-]/g, ""),
          candidateId: routing.candidateId,
          attachments: email.attachments,
        })
      : []

    /* ── Le message d'abord, l'analyse ensuite ─────────────────────────────
     *
     * Deux raisons de ne pas faire appel au modèle avant d'écrire.
     *
     * SNS abandonne une livraison au bout d'une quinzaine de secondes et la
     * retente. Ajouter une latence de modèle DEVANT l'écriture, c'est risquer
     * d'être coupé juste avant elle : le message serait perdu, et retraité en
     * repartant de zéro. Écrire d'abord met à l'abri la seule chose
     * irremplaçable ici — la réponse du candidat. Une suggestion manquante se
     * rattrape ; un message perdu, non.
     *
     * Et l'insertion est IDEMPOTENTE (`provider_id`, migration 088) : si AWS
     * retente malgré tout, le sourceur ne voit pas sa réponse en double. */
    const providerId = payload.mail?.messageId ?? null
    const { data: inserted, error } = await admin
      .from("email_messages")
      .upsert({
        attachments,
        user_id: routing.userId,
        organization_id: routing.organizationId,
        candidate_id: routing.candidateId,
        job_id: routing.jobId,
        direction: "inbound",
        from_address: email.fromAddress,
        to_address: target,
        subject: email.subject || null,
        body_text: bodyText || null,
        body_html: email.html,
        provider_id: providerId,
        /* L'identifiant RFC du message du candidat. Il était LU par
         * `parseInboundEmail` puis jeté — sans lui, nos réponses ne peuvent
         * pas porter `In-Reply-To`, et arrivent chez lui à côté de l'échange
         * en cours au lieu d'y répondre. Distinct de `provider_id`, qui est
         * l'identifiant SES. */
        rfc_message_id: email.messageId,
        status: "received",
      }, { onConflict: "provider_id", ignoreDuplicates: false })
      .select("id")
      .single()

    if (error) {
      // Échec d'écriture : on NE supprime PAS l'objet S3 et on renvoie 500
      // pour que SNS retente. C'est le seul cas où une nouvelle tentative a
      // une chance d'aboutir — et le seul où perdre le message serait grave.
      console.error("[mailing/inbound] insertion impossible:", error.message)
      return NextResponse.json({ error: "store_failed" }, { status: 500 })
    }

    // Nora lit la réponse — une SUGGESTION, jamais appliquée d'office. Le même
    // appel que sur le chemin Resend, et pour cause : sans lui, une réponse
    // arrivée sur le domaine du cabinet n'aurait ni sentiment, ni résumé, ni
    // étape suggérée, là où la même réponse en obtient trois sur le domaine
    // Naywa. Le sourceur ne verrait aucune erreur — juste des suggestions qui
    // cessent d'apparaître le jour où son organisation active son domaine.
    //
    // Un échec ici ne remonte pas : le message est déjà en base, et une
    // suggestion absente vaut mieux qu'un retraitement complet.
    const analysis = await analyzeReply(bodyText ?? "", routing.organizationId, { isAdmin: routing.isAdmin })
    if (analysis.sentiment || analysis.summary) {
      await admin.from("email_messages").update({
        ai_sentiment: analysis.sentiment,
        ai_summary: analysis.summary,
        ai_suggested_stage: analysis.suggestedStage,
      }).eq("id", inserted.id)
    }

    console.info("[mailing/inbound] message rattaché", {
      user: routing.userId,
      candidate: routing.candidateId,
      job: routing.jobId,
      attachments: attachments.length,
    })

    // Le contenu est en base et les pièces jointes sont recopiées sur R2 :
    // l'objet S3 n'a plus de raison d'exister. Le garder reviendrait à
    // conserver les échanges candidats à DEUX endroits — minimisation RGPD
    // autant que ménage.
    await deleteRawEmail(objectKey)

    return NextResponse.json({
      ok: true,
      matched: !!routing.candidateId,
      attachments: email.attachments.length,
    })
  } catch (err) {
    // Format inattendu : on accuse quand même, sinon SNS retente en boucle un
    // message qui ne deviendra jamais valide.
    console.error("[mailing/inbound] notification illisible:", err)
    return NextResponse.json({ ok: true, ignored: "unparsable" })
  }
}
