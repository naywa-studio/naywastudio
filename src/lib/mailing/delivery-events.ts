/**
 * Ce qu'un événement d'envoi SES veut dire pour le sourceur.
 *
 * ── Pourquoi ce fichier existe ────────────────────────────────────────────
 *
 * Il manquait, et son absence était un trou produit, pas un oubli technique.
 * Sur le chemin SES, un message qui rebondissait restait `sent` **pour
 * toujours** : le sourceur croyait avoir contacté quelqu'un qui n'avait jamais
 * rien reçu, relançait dans le vide, et concluait que le candidat ne répond
 * pas. C'est exactement ce que la règle « le domaine du client ou rien »
 * cherchait à éviter — un envoi qui a l'air d'avoir marché.
 *
 * C'est aussi, d'après la documentation d'AWS, la cause de refus d'accès
 * production la plus fréquente : un compte qui ne collecte pas ses rebonds ne
 * peut pas prouver qu'il les traite.
 *
 * ── Le piège de l'ordre ───────────────────────────────────────────────────
 *
 * SNS ne garantit **pas** l'ordre de livraison, et retente. Une notification
 * de remise peut donc arriver APRÈS une plainte concernant le même message.
 * Traiter chaque événement isolément écraserait « signalé comme indésirable »
 * par « remis », et le sourceur ne verrait jamais la plainte.
 *
 * D'où une PRÉCÉDENCE explicite plutôt qu'une simple écriture : un état ne
 * recule jamais vers un état moins grave.
 */

import type { Database } from "../database.types"

export type MessageStatus = Database["public"]["Tables"]["email_messages"]["Row"]["status"]

/**
 * Gravité croissante. Un événement n'est appliqué que s'il fait MONTER le
 * message dans cette échelle — jamais descendre.
 *
 * `received` appartient aux messages entrants et ne croise jamais ce chemin ;
 * il est placé au plus bas pour que le tableau reste total.
 */
const SEVERITY: Record<MessageStatus, number> = {
  received: 0,
  sent: 1,
  delivered: 2,
  failed: 3,
  bounced: 4,
  complained: 5,
}

export interface SesEventVerdict {
  /** `MessageId` SES — la clé de rapprochement avec `email_messages.provider_id`. */
  providerId: string
  /** L'état à appliquer, ou `null` quand l'événement n'en change aucun. */
  status: MessageStatus | null
  /** Explication destinée au sourceur, en français, sans jargon SMTP. */
  error: string | null
}

/** Charge utile d'une notification d'événement SES (champs utilisés seulement). */
export interface SesEventPayload {
  eventType?: string
  notificationType?: string
  mail?: { messageId?: string }
  bounce?: {
    bounceType?: string
    bounceSubType?: string
    bouncedRecipients?: { emailAddress?: string; diagnosticCode?: string }[]
  }
  complaint?: { complaintFeedbackType?: string }
  delivery?: unknown
  reject?: { reason?: string }
}

/**
 * Un état doit-il remplacer l'état courant ?
 *
 * Exporté pour être éprouvé : c'est la règle qui empêche une remise tardive
 * d'effacer un rebond, et elle ne se voit pas à l'usage — un état écrasé
 * ressemble à un état correct.
 */
export function shouldApply(current: MessageStatus, next: MessageStatus): boolean {
  return SEVERITY[next] > SEVERITY[current]
}

/**
 * Traduit un événement SES en verdict.
 *
 * Les rebonds ne se valent pas :
 *
 *   `Permanent`   l'adresse n'existe pas, ou refuse définitivement. Le message
 *                 n'arrivera jamais — c'est un échec, et il doit se voir.
 *   `Transient`   boîte pleine, serveur momentanément indisponible. SES
 *                 réessaie ; annoncer un échec serait faux. On garde l'état et
 *                 on note la cause.
 *   `Undetermined` cause inconnue. Traité comme transitoire, délibérément : se
 *                 tromper en annonçant un échec coûte plus cher que se tromper
 *                 en restant silencieux — dans le premier cas le sourceur
 *                 abandonne un candidat joignable.
 */
export function classifySesEvent(payload: SesEventPayload): SesEventVerdict | null {
  const providerId = payload.mail?.messageId
  if (!providerId) return null

  // SES nomme le champ `eventType` via un jeu de configuration, et
  // `notificationType` via les notifications d'identité. Même contenu, deux
  // portes d'entrée : accepter les deux évite qu'un changement de câblage côté
  // AWS rende ce fichier muet sans rien casser de visible.
  const type = payload.eventType ?? payload.notificationType ?? ""

  switch (type) {
    case "Bounce": {
      const kind = payload.bounce?.bounceType ?? ""
      if (kind !== "Permanent") {
        return {
          providerId,
          status: null,
          error: `Remise différée (${payload.bounce?.bounceSubType || kind || "cause inconnue"}). Le fournisseur réessaie.`,
        }
      }
      const sub = payload.bounce?.bounceSubType ?? ""
      return {
        providerId,
        status: "bounced",
        error: sub === "NoEmail"
          ? "Cette adresse n'existe pas."
          : "Le serveur du destinataire a refusé définitivement ce message.",
      }
    }

    case "Complaint":
      return {
        providerId,
        status: "complained",
        error: "Le destinataire a signalé ce message comme indésirable.",
      }

    case "Delivery":
      return { providerId, status: "delivered", error: null }

    case "Reject":
      return {
        providerId,
        status: "failed",
        error: payload.reject?.reason ?? "Message refusé avant envoi.",
      }

    default:
      // Ouverture, clic, abonnement… : rien à dire sur l'acheminement.
      return null
  }
}
