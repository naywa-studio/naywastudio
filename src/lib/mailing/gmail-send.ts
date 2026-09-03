/**
 * Envoyer par la boîte Gmail du sourceur.
 *
 * ── Pourquoi ce chemin est le meilleur des trois ─────────────────────────
 *
 * Les cabinets sont presque toujours sur Google Workspace avec leur propre
 * domaine. La boîte connectée est donc déjà `sophie@cabinet-durand.fr` : le
 * message part de sa vraie adresse professionnelle, avec la réputation et
 * l'authentification que ce domaine a déjà. Rien à publier, rien à chauffer,
 * et une copie dans ses « Éléments envoyés » là où elle la cherchera.
 *
 * ── L'API Gmail veut un message COMPLET, pas des champs ──────────────────
 *
 * `users.messages.send` prend un message RFC 822 déjà assemblé. On construit
 * donc les en-têtes à la main — ce qui rend le filtrage anti-injection
 * indispensable plutôt que théorique : un saut de ligne dans un sujet ou un
 * nom permettrait d'ajouter un `Bcc:` invisible.
 *
 * ── Ce qu'on ne fait PAS ─────────────────────────────────────────────────
 *
 * On n'utilise `gmail.send` que pour envoyer. Aucune lecture, aucun brouillon,
 * aucun libellé — ce sont des scopes RESTREINTS (évaluation CASA à
 * 15 000-75 000 $/an). Cf. `lib/mailing/oauth-google.ts`.
 */

import { buildMimeMessage, type MimeMessage } from "./mime"

const SEND_ENDPOINT = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send"

/** Le message tel que l'appelant le fournit. Identique à celui de Graph : les
 *  deux passent désormais par le même assembleur MIME (cf. `mime.ts`). */
export type GmailMessage = MimeMessage

/**
 * Assemble le message RFC 822 attendu par l'API Gmail.
 *
 * Réexporté sous son nom historique. L'assembleur lui-même vit maintenant dans
 * `mime.ts`, parce que Graph en a besoin mot pour mot : sans MIME, Microsoft
 * refuse `In-Reply-To`, et nos réponses arrivent hors du fil du candidat.
 */
export const buildRawMessage = buildMimeMessage

export type GmailSendResult =
  | { ok: true; id: string }
  /** Le jeton n'est plus valable : à afficher, pas à réessayer. */
  | { ok: false; reason: "needs_reconnect"; detail: string }
  | { ok: false; reason: "failed"; detail: string }

/**
 * Envoie, avec un jeton d'accès déjà obtenu.
 *
 * Distingue **« reconnectez votre boîte »** de **« ça a échoué »**, et c'est
 * la distinction qui compte : un jeton mort ne se répare pas en réessayant, il
 * se répare en reconnectant. Confondre les deux ferait boucler le sourceur sur
 * un bouton qui ne marchera jamais.
 */
export async function sendViaGmail(accessToken: string, m: GmailMessage): Promise<GmailSendResult> {
  const raw = Buffer.from(buildRawMessage(m), "utf8").toString("base64url")

  let res: Response
  try {
    res = await fetch(SEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw }),
    })
  } catch (err) {
    return { ok: false, reason: "failed", detail: (err as Error).message }
  }

  if (res.ok) {
    const data = await res.json().catch(() => ({})) as { id?: string }
    if (!data.id) return { ok: false, reason: "failed", detail: "Gmail : envoi sans identifiant" }
    return { ok: true, id: data.id }
  }

  const body = await res.text().catch(() => "")
  // 401 = jeton refusé ; 403 = autorisation retirée ou scope insuffisant.
  // Dans les deux cas, réessayer ne servira à rien.
  if (res.status === 401 || res.status === 403) {
    return { ok: false, reason: "needs_reconnect", detail: body.slice(0, 300) }
  }
  return { ok: false, reason: "failed", detail: `Gmail ${res.status} — ${body.slice(0, 300)}` }
}
