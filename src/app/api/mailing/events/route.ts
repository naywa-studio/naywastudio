/**
 * POST /api/mailing/events
 *
 * Reçoit les événements d'ACHEMINEMENT publiés par SES via SNS : rebonds,
 * plaintes, remises, refus. Point d'entrée PUBLIC — c'est AWS qui appelle.
 *
 * ── Ne pas confondre avec `/api/mailing/inbound` ──────────────────────────
 *
 * L'autre route reçoit les MESSAGES des candidats. Celle-ci ne reçoit que le
 * SORT de nos propres envois. Deux rubriques SNS distinctes, deux routes
 * distinctes : mélanger les deux ferait qu'une rubrique mal configurée
 * déposerait des événements là où on attend des messages.
 *
 * ── Mêmes deux contrôles que l'inbound, et pour les mêmes raisons ─────────
 *
 * La signature prouve qu'AWS a relayé le message ; la rubrique prouve qu'il
 * vient de la NÔTRE. Sans le second, n'importe qui crée une rubrique chez lui,
 * y abonne cette URL, et fait passer les messages d'un cabinet pour des
 * rebonds — le sourceur croirait ses candidats injoignables.
 *
 * ── Pourquoi 200 sur une erreur métier ───────────────────────────────────
 *
 * SNS retente sur tout code non-2xx. Un événement qu'on ne sait pas rattacher
 * ne s'améliorera pas au troisième essai.
 */

import { NextRequest, NextResponse } from "next/server"
import { verifySnsMessage, isTrustedCertUrl, type SnsMessage } from "@/lib/mailing/sns"
import { classifySesEvent, shouldApply, type MessageStatus, type SesEventPayload } from "@/lib/mailing/delivery-events"
import { suppressAddress } from "@/lib/mailing/suppression"
import { getAdminSupabase } from "@/lib/admin-supabase"

export const runtime = "nodejs"
export const maxDuration = 30

/** Rubrique(s) SNS d'événements autorisée(s), séparées par des virgules. */
function allowedTopics(): string[] {
  return (process.env.AWS_SNS_EVENTS_TOPIC_ARN ?? "")
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
    console.error("[mailing/events] signature refusée:", verdict.reason)
    return NextResponse.json({ error: "invalid_signature" }, { status: 403 })
  }

  const topics = allowedTopics()
  if (topics.length === 0) {
    console.error("[mailing/events] AWS_SNS_EVENTS_TOPIC_ARN absente — refus par défaut")
    return NextResponse.json({ error: "topic_not_configured" }, { status: 403 })
  }
  if (!msg.TopicArn || !topics.includes(msg.TopicArn)) {
    console.error("[mailing/events] rubrique inattendue:", msg.TopicArn)
    return NextResponse.json({ error: "unexpected_topic" }, { status: 403 })
  }

  if (msg.Type === "SubscriptionConfirmation") {
    if (!msg.SubscribeURL || !isTrustedCertUrl(msg.SubscribeURL)) {
      console.error("[mailing/events] SubscribeURL non fiable")
      return NextResponse.json({ error: "untrusted_subscribe_url" }, { status: 403 })
    }
    try {
      const res = await fetch(msg.SubscribeURL)
      console.info("[mailing/events] abonnement confirmé:", res.status, msg.TopicArn)
    } catch (err) {
      // Échec réellement transitoire : on veut qu'AWS retente.
      console.error("[mailing/events] confirmation impossible:", err)
      return NextResponse.json({ error: "confirm_failed" }, { status: 500 })
    }
    return NextResponse.json({ ok: true, confirmed: true })
  }

  if (msg.Type !== "Notification") {
    return NextResponse.json({ ok: true, ignored: msg.Type })
  }

  let payload: SesEventPayload
  try {
    payload = JSON.parse(msg.Message ?? "{}") as SesEventPayload
  } catch {
    console.error("[mailing/events] charge utile illisible")
    return NextResponse.json({ ok: true, ignored: "unparsable" })
  }

  const event = classifySesEvent(payload)
  if (!event) return NextResponse.json({ ok: true, ignored: "not_a_delivery_event" })

  const admin = getAdminSupabase()

  /* ── Lire avant d'écrire ───────────────────────────────────────────────
   *
   * SNS ne garantit pas l'ordre et retente : une remise peut arriver après
   * une plainte pour le même message. Écrire à l'aveugle effacerait
   * « signalé comme indésirable » par « remis », et le sourceur ne verrait
   * jamais la plainte. `shouldApply` interdit tout retour en arrière. */
  const { data: message } = await admin
    .from("email_messages")
    .select("id, status, to_address")
    .eq("provider_id", event.providerId)
    .eq("direction", "outbound")
    .maybeSingle()

  if (!message) {
    // Un envoi qu'on ne connaît pas : message d'un autre système partageant la
    // rubrique, ou événement arrivé avant l'écriture de notre ligne. Tracé
    // pour distinguer « rien ne remonte » de « ça remonte mais on jette ».
    console.warn("[mailing/events] envoi inconnu:", event.providerId, event.status)
    return NextResponse.json({ ok: true, ignored: "unknown_message" })
  }

  // Un rebond transitoire n'a pas d'état à poser, mais sa cause vaut d'être
  // gardée : c'est elle qui explique un silence qui dure.
  const patch: { status?: MessageStatus; error?: string | null } = {}
  if (event.status && shouldApply(message.status, event.status)) patch.status = event.status
  if (event.error) patch.error = event.error

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: true, unchanged: true })
  }

  /* ── Ne plus jamais écrire à cette adresse ─────────────────────────────
   *
   * Sans ça, une adresse qui rebondit définitivement pouvait être recontactée
   * le lendemain par un collègue de la même organisation, indéfiniment.
   * Harcèlement involontaire côté candidat, et — la réputation SES étant
   * partagée entre tous les cabinets du compte — le meilleur moyen de faire
   * suspendre l'envoi de TOUT LE MONDE.
   *
   * Posé avant la mise à jour du message : c'est l'effet qui compte le plus,
   * et il ne doit pas dépendre de la réussite d'une écriture cosmétique. */
  if (patch.status === "bounced" || patch.status === "complained") {
    await suppressAddress(admin, {
      email: message.to_address,
      reason: patch.status === "bounced" ? "bounce" : "complaint",
      detail: event.error,
    })
  }

  const { error } = await admin.from("email_messages").update(patch).eq("id", message.id)
  if (error) {
    // Seul cas où retenter a une chance d'aboutir.
    console.error("[mailing/events] mise à jour impossible:", error.message)
    return NextResponse.json({ error: "store_failed" }, { status: 500 })
  }

  return NextResponse.json({ ok: true, status: patch.status ?? message.status })
}
