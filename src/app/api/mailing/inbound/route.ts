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
import { getAdminSupabase } from "@/lib/admin-supabase"

export const runtime = "nodejs"

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

    const { error } = await admin.from("email_messages").insert({
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
      provider_id: payload.mail?.messageId ?? null,
      status: "received",
    })

    if (error) {
      // Échec d'écriture : on NE supprime PAS l'objet S3 et on renvoie 500
      // pour que SNS retente. C'est le seul cas où une nouvelle tentative a
      // une chance d'aboutir — et le seul où perdre le message serait grave.
      console.error("[mailing/inbound] insertion impossible:", error.message)
      return NextResponse.json({ error: "store_failed" }, { status: 500 })
    }

    console.info("[mailing/inbound] message rattaché", {
      user: routing.userId,
      candidate: routing.candidateId,
      job: routing.jobId,
      attachments: email.attachments.length,
    })

    // Le contenu est en base : l'objet S3 n'a plus de raison d'exister.
    // Le garder reviendrait à conserver les échanges candidats à DEUX
    // endroits — minimisation RGPD autant que ménage.
    //
    // ⚠️ Les pièces jointes ne sont pas encore stockées durablement : elles
    // disparaissent donc avec l'objet. C'est assumé pour ce lot, et c'est la
    // première chose à traiter au suivant.
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
