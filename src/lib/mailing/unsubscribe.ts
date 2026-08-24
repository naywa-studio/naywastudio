/**
 * Le lien « ne plus me contacter » posé dans chaque message candidat.
 *
 * ── Pourquoi un jeton signé, et pas une ligne en base ─────────────────────
 *
 * Le lien doit exister AU MOMENT DE L'ENVOI, pour une adresse qui n'est encore
 * dans aucune liste. Créer une ligne par destinataire et par message ferait
 * grossir une table pour une action que presque personne ne fera.
 *
 * Un HMAC règle ça : la valeur se recalcule à la réception, donc rien à
 * stocker, et elle est infalsifiable sans le secret. Sans signature, l'URL
 * contiendrait une adresse en clair modifiable — n'importe qui pourrait
 * désinscrire n'importe quel candidat de n'importe quel cabinet, en changeant
 * un paramètre.
 *
 * ── Le piège du « un clic » ───────────────────────────────────────────────
 *
 * Gmail et Outlook déclenchent `List-Unsubscribe-Post` en **POST**, sans
 * intervention humaine, parfois à la simple analyse du message. Une
 * désinscription ne doit donc JAMAIS se produire sur un GET : un aperçu
 * automatique désinscrirait le candidat à son insu. Le GET affiche une page
 * avec un bouton ; seul le POST agit.
 */

import { createHmac, timingSafeEqual } from "node:crypto"
import { normalizeEmail } from "./suppression"

/**
 * Le secret de signature.
 *
 * Un secret dédié si l'environnement en fournit un, sinon celui des tâches
 * planifiées — server-only et aléatoire, il fait l'affaire. Si aucun n'existe,
 * on renvoie `null` : mieux vaut un message SANS lien de désinscription qu'un
 * lien signé avec une valeur vide, que n'importe qui pourrait reproduire.
 */
function secret(): string | null {
  const dedicated = (process.env.MAILING_UNSUBSCRIBE_SECRET ?? "").trim()
  if (dedicated) return dedicated
  const fallback = (process.env.CRON_SECRET ?? "").trim()
  return fallback || null
}

function sign(payload: string, key: string): string {
  return createHmac("sha256", key).update(payload).digest("base64url")
}

/**
 * Jeton d'une paire (candidat, organisation).
 *
 * Il porte l'organisation parce que la désinscription est **une relation** :
 * ce candidat ne veut plus être contacté par CE cabinet. Un jeton sans
 * organisation ne saurait pas quoi écrire dans la liste.
 */
export function unsubscribeToken(email: string, organizationId: string): string | null {
  const key = secret()
  if (!key) return null
  const payload = `${normalizeEmail(email)}:${organizationId}`
  return `${Buffer.from(payload, "utf8").toString("base64url")}.${sign(payload, key)}`
}

export interface UnsubscribeClaim {
  email: string
  organizationId: string
}

/** Relit un jeton. `null` si l'un des trois manque : secret, forme, signature. */
export function readUnsubscribeToken(token: string | null | undefined): UnsubscribeClaim | null {
  const key = secret()
  if (!key || !token) return null

  const dot = token.lastIndexOf(".")
  if (dot <= 0) return null
  const body = token.slice(0, dot)
  const given = token.slice(dot + 1)

  let payload: string
  try {
    payload = Buffer.from(body, "base64url").toString("utf8")
  } catch {
    return null
  }

  // Comparaison à temps constant : une comparaison ordinaire s'arrête au
  // premier octet différent, ce qui laisse deviner la signature caractère par
  // caractère en mesurant le temps de réponse.
  const expected = sign(payload, key)
  const a = Buffer.from(expected)
  const b = Buffer.from(given)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  const sep = payload.lastIndexOf(":")
  if (sep <= 0) return null
  const email = payload.slice(0, sep)
  const organizationId = payload.slice(sep + 1)
  if (!email.includes("@") || !organizationId) return null

  return { email, organizationId }
}

/**
 * Les en-têtes de désinscription à joindre au message.
 *
 * `List-Unsubscribe` seul fait afficher le bouton natif de Gmail et d'Outlook ;
 * `List-Unsubscribe-Post` autorise le « un clic » sans quitter la messagerie.
 * Les deux comptent pour la réputation d'envoi — leur absence est un des
 * signaux qui font traiter un expéditeur comme un indésirable.
 *
 * Renvoie un objet vide si le jeton n'a pas pu être fabriqué : un en-tête
 * `List-Unsubscribe` qui pointe vers un lien non fonctionnel serait pire que
 * pas d'en-tête du tout.
 */
export function unsubscribeHeaders(
  email: string,
  organizationId: string,
  appUrl: string,
): Record<string, string> {
  const token = unsubscribeToken(email, organizationId)
  if (!token) return {}
  const url = `${appUrl.replace(/\/+$/, "")}/api/mailing/unsubscribe?t=${encodeURIComponent(token)}`
  return {
    "List-Unsubscribe": `<${url}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  }
}
