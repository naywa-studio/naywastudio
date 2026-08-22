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
import { fetchRawEmail, parseInboundEmail } from "@/lib/mailing/inbound"

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

    // Le rattachement au sourceur et à la conversation vient ensuite. On
    // observe d'abord ce que l'analyse produit sur de vrais messages : les
    // clients de messagerie prennent des libertés avec le format, et coder
    // contre la théorie mènerait à refaire le travail.
    console.info("[mailing/inbound] email lu", {
      from: email.fromAddress,
      to: email.to,
      subject: email.subject,
      textLength: email.text.length,
      textPreview: email.text.slice(0, 160),
      inReplyTo: email.inReplyTo,
      references: email.references.length,
      attachments: email.attachments.map((a) => ({
        filename: a.filename,
        contentType: a.contentType,
        sizeKo: Math.round(a.size / 1024),
      })),
      rawSizeKo: Math.round(raw.length / 1024),
    })

    // ⚠️ On ne supprime PAS encore l'objet S3 : tant que le contenu n'est pas
    // écrit en base, l'effacer reviendrait à perdre le message. La suppression
    // se branchera avec l'enregistrement, dans le même geste.

    return NextResponse.json({ ok: true, received: recipients.length })
  } catch (err) {
    // Format inattendu : on accuse quand même, sinon SNS retente en boucle un
    // message qui ne deviendra jamais valide.
    console.error("[mailing/inbound] notification illisible:", err)
    return NextResponse.json({ ok: true, ignored: "unparsable" })
  }
}
