/**
 * L'assemblage d'un message RFC 822, partagé par les boîtes connectées.
 *
 * ── Pourquoi ce fichier existe ────────────────────────────────────────────
 *
 * Il vivait dans `gmail-send.ts`. Il en sort pour une raison précise :
 * **Graph refuse dans `internetMessageHeaders` tout en-tête ne commençant pas
 * par `X-`.** `In-Reply-To`, `References`, `List-Unsubscribe` y sont donc
 * impossibles — et sans `In-Reply-To`, notre réponse arrive chez le candidat
 * comme un message neuf, à côté de l'échange en cours.
 *
 * Graph accepte en revanche un **MIME complet**. En passant les deux
 * fournisseurs par le même assembleur, un message part identique quel que soit
 * le transport, et une règle d'en-tête écrite une fois vaut pour les deux.
 * Deux assembleurs auraient divergé, et la divergence ne se verrait pas :
 * le message part, il a l'air normal, il atterrit simplement au mauvais
 * endroit dans la boîte du candidat.
 *
 * ── Ce qui se joue ici, et qui n'est pas cosmétique ───────────────────────
 *
 * L'injection d'en-têtes. Un défaut ne produit aucune erreur — seulement un
 * message parti avec un destinataire caché que le sourceur n'a jamais vu.
 * D'où le filtrage de CHAQUE valeur, et du nom d'en-tête lui-même.
 */

export interface MimeMessage {
  /** Nom affiché de l'expéditeur — le sourceur. */
  fromName?: string | null
  /** L'adresse connectée. Les deux fournisseurs l'imposent de toute façon. */
  fromEmail: string
  to: string
  subject: string
  text: string
  /** Liste d'adresses séparées par des virgules. */
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
export function headerValue(v: string): string {
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
export function encodeHeader(v: string): string {
  const clean = headerValue(v)
  if (/^[\x00-\x7F]*$/.test(clean)) return clean
  return `=?UTF-8?B?${Buffer.from(clean, "utf8").toString("base64")}?=`
}

/** L'en-tête `From` : nom du sourceur, adresse connectée. */
export function mimeFromHeader(name: string | null | undefined, email: string): string {
  // L'arobase est retirée du NOM : sans ça, « Sophie x@evil.com » s'afficherait
  // tel quel chez le candidat, qui lirait un expéditeur qui n'en est pas un.
  const clean = headerValue((name ?? "").replace(/["<>@]/g, " ")).replace(/\s{2,}/g, " ")
  return clean ? `${encodeHeader(clean)} <${email}>` : email
}

/**
 * Assemble le message, prêt à être encodé pour Gmail ou pour Graph.
 *
 * Exporté pour être éprouvé : c'est le seul endroit du produit où une chaîne
 * mal filtrée devient un en-tête d'email.
 */
export function buildMimeMessage(m: MimeMessage): string {
  const lines: string[] = [
    `From: ${mimeFromHeader(m.fromName, m.fromEmail)}`,
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
