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

const SEND_ENDPOINT = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send"

export interface GmailMessage {
  /** Nom affiché de l'expéditeur — le sourceur. */
  fromName?: string | null
  /** L'adresse connectée. Gmail refuse tout autre expéditeur. */
  fromEmail: string
  to: string
  subject: string
  text: string
  replyTo?: string
  bcc?: string
  headers?: Record<string, string>
}

/**
 * Retire ce qui permettrait de refermer un en-tête pour en injecter un autre.
 *
 * Les sauts de ligne d'abord — c'est par là qu'on ajoute un `Bcc:` que le
 * sourceur ne verrait jamais. Appliqué à CHAQUE valeur d'en-tête, pas
 * seulement à celles qui semblent risquées : c'est la seule façon que la
 * garde survive à l'ajout d'un champ.
 */
function headerValue(v: string): string {
  return v.replace(/[\r\n]+/g, " ").trim()
}

/**
 * Encode un en-tête non-ASCII selon la RFC 2047.
 *
 * Sans ça, un sujet contenant un accent — donc la quasi-totalité des sujets
 * en français — arrive illisible chez le candidat. Le mot encodé est
 * volontairement produit d'un bloc : découper proprement sur plusieurs lignes
 * ne vaut la peine que pour des sujets très longs, et un découpage FAUX est
 * pire qu'une ligne longue.
 */
function encodeHeader(v: string): string {
  const clean = headerValue(v)
  if (/^[\x00-\x7F]*$/.test(clean)) return clean
  return `=?UTF-8?B?${Buffer.from(clean, "utf8").toString("base64")}?=`
}

/** L'en-tête `From` : nom du sourceur, adresse connectée. */
function fromHeader(name: string | null | undefined, email: string): string {
  // L'arobase est retirée du NOM : sans ça, « Sophie x@evil.com » s'afficherait
  // tel quel chez le candidat, qui lirait un expéditeur qui n'en est pas un.
  const clean = headerValue((name ?? "").replace(/["<>@]/g, " ")).replace(/\s{2,}/g, " ")
  return clean ? `${encodeHeader(clean)} <${email}>` : email
}

/**
 * Assemble le message RFC 822, prêt pour l'API Gmail.
 *
 * Exporté pour être éprouvé : c'est ici que se joue l'injection d'en-têtes, et
 * un défaut n'y produirait aucune erreur — seulement un message parti avec un
 * destinataire caché.
 */
export function buildRawMessage(m: GmailMessage): string {
  const lines: string[] = [
    `From: ${fromHeader(m.fromName, m.fromEmail)}`,
    `To: ${headerValue(m.to)}`,
    `Subject: ${encodeHeader(m.subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
  ]
  if (m.replyTo) lines.push(`Reply-To: ${headerValue(m.replyTo)}`)
  if (m.bcc) lines.push(`Bcc: ${headerValue(m.bcc)}`)
  for (const [name, value] of Object.entries(m.headers ?? {})) {
    // Le NOM d'en-tête est filtré lui aussi : un « : » ou un saut de ligne
    // dedans permettrait d'en fabriquer un second.
    const key = name.replace(/[^A-Za-z0-9-]/g, "")
    if (key) lines.push(`${key}: ${headerValue(value)}`)
  }

  // Corps en base64 sur des lignes de 76 caractères, comme l'exige le MIME.
  const body = Buffer.from(m.text, "utf8").toString("base64").replace(/(.{76})/g, "$1\r\n")
  return `${lines.join("\r\n")}\r\n\r\n${body}`
}

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
