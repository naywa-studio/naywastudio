/**
 * Envoi par Microsoft Graph — l'équivalent de `gmail-send.ts`.
 *
 * ── Le même message que Gmail, par le même assembleur ────────────────────
 *
 * Ce fichier composait un objet JSON que Graph transformait lui-même en
 * message. C'était plus court, et ça coûtait deux en-têtes : Microsoft
 * n'accepte dans `internetMessageHeaders` que ce qui commence par « X- »,
 * donc ni `In-Reply-To` (nos réponses arrivaient hors du fil du candidat) ni
 * `List-Unsubscribe` (pas de bouton « Se désabonner » natif).
 *
 * Graph accepte aussi un **MIME complet**. On lui envoie donc exactement ce
 * qu'on envoie à Gmail, via `mime.ts`. Un message part identique quel que soit
 * le transport, et une règle d'en-tête écrite une fois vaut pour les deux.
 *
 * Contrepartie assumée : l'injection d'en-têtes redevient un vecteur réel,
 * puisqu'il y a de nouveau des en-têtes à refermer. Le filtrage vit dans
 * `mime.ts` et y est éprouvé.
 *
 * ── Ce que Graph impose ───────────────────────────────────────────────────
 *
 * - **L'expéditeur n'est pas paramétrable.** Graph envoie depuis la boîte du
 *   jeton, point. Le `From` du MIME est donc informatif : le préciser
 *   autrement ferait échouer l'appel sur les comptes sans droit d'usurpation.
 * - **Les « Éléments envoyés »** : en JSON, `saveToSentItems: true` le
 *   garantissait. En MIME il n'y a pas d'équivalent — Graph y range le message
 *   par défaut. ⚠️ **Non constaté par nous** : à vérifier au premier envoi
 *   réel, c'est une promesse du connecteur (écrire depuis sa vraie boîte, avec
 *   la trace dans sa vraie boîte).
 */

import { buildMimeMessage } from "./mime"

const SEND_ENDPOINT = "https://graph.microsoft.com/v1.0/me/sendMail"

export interface GraphMessage {
  /** Nom affiché de l'expéditeur — le sourceur. */
  fromName?: string | null
  /** L'adresse connectée. Graph l'impose de toute façon ; sert aux journaux. */
  fromEmail: string
  to: string
  subject: string
  text: string
  /** Liste d'adresses séparées par des virgules, comme pour Gmail. */
  replyTo?: string
  bcc?: string
  headers?: Record<string, string>
}

export type GraphSendResult =
  | { ok: true; id: string }
  /** Le jeton est mort : reconnecter, ne pas réessayer. */
  | { ok: false; reason: "needs_reconnect"; detail: string }
  | { ok: false; reason: "failed"; detail: string }

/**
 * Envoie le message.
 *
 * La distinction entre les deux échecs est la seule chose qui compte ici :
 * un 401/403 veut dire que le consentement a sauté et qu'il faut le DIRE au
 * sourceur ; tout le reste est une panne passagère, et couper une boîte saine
 * parce que Microsoft a hoqueté obligerait à reconnecter pour rien.
 */
export async function sendViaGraph(accessToken: string, m: GraphMessage): Promise<GraphSendResult> {
  /* ── Pourquoi un MIME et non le JSON de Graph ──────────────────────────
   *
   * `internetMessageHeaders` n'accepte que des en-têtes commençant par « X- ».
   * Deux en-têtes essentiels y étaient donc impossibles :
   *
   *   - `In-Reply-To` / `References` — sans eux, notre réponse arrive chez le
   *     candidat comme un message NEUF, à côté de l'échange en cours ;
   *   - `List-Unsubscribe` — le bouton « Se désabonner » natif d'Outlook et de
   *     Gmail, dont l'absence est l'un des signaux qui font traiter un
   *     expéditeur comme indésirable.
   *
   * Graph accepte en revanche un message MIME complet, encodé en base64 avec
   * `Content-Type: text/plain`. On passe donc par le même assembleur que
   * Gmail : un message part identique quel que soit le transport.
   *
   * ⚠️ Ce chemin n'a JAMAIS été exécuté contre le vrai Graph — aucune boîte
   * Microsoft n'a encore pu être connectée (cf. `docs/etude-connecteur-
   * microsoft.md`). L'assemblage est éprouvé par des tests, l'envoi ne l'est
   * pas. À vérifier au premier envoi réel : que le message atterrisse bien
   * dans les « Éléments envoyés » — le MIME n'a pas d'équivalent au drapeau
   * `saveToSentItems`, Graph l'y range par défaut mais nous ne l'avons pas
   * constaté nous-mêmes. */
  const mime = buildMimeMessage({
    fromName: m.fromName,
    fromEmail: m.fromEmail,
    to: m.to,
    subject: m.subject,
    text: m.text,
    replyTo: m.replyTo,
    bcc: m.bcc,
    headers: m.headers,
  })

  let res: Response
  try {
    res = await fetch(SEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        // Graph distingue les deux modes par ce seul en-tête.
        "Content-Type": "text/plain",
      },
      body: Buffer.from(mime, "utf8").toString("base64"),
    })
  } catch (err) {
    return { ok: false, reason: "failed", detail: err instanceof Error ? err.message : "network" }
  }

  // Graph répond 202 sans corps : il n'y a pas d'identifiant de message à
  // récupérer, contrairement à Gmail. On en fabrique un pour le journal.
  if (res.status === 202 || res.ok) {
    return { ok: true, id: `graph-${Date.now().toString(36)}` }
  }

  const detail = await res.text().catch(() => "")
  if (res.status === 401 || res.status === 403) {
    return { ok: false, reason: "needs_reconnect", detail: detail.slice(0, 300) || `HTTP ${res.status}` }
  }
  return { ok: false, reason: "failed", detail: detail.slice(0, 300) || `HTTP ${res.status}` }
}
