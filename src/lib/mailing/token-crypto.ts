/**
 * Chiffrement des jetons de rafraîchissement OAuth.
 *
 * ── Pourquoi ce fichier existe séparément ─────────────────────────────────
 *
 * Un jeton de rafraîchissement Google permet d'**envoyer des emails au nom de
 * quelqu'un, indéfiniment**. C'est le secret le plus sensible que Naywa ait
 * jamais stocké — davantage qu'un mot de passe, qui expire et se change.
 * Une fuite de la base sans ce chiffrement donnerait à qui la lit le pouvoir
 * d'écrire à des candidats sous l'identité de nos clients.
 *
 * ── AES-256-GCM, et pas autre chose ───────────────────────────────────────
 *
 * GCM est *authentifié* : déchiffrer un texte modifié échoue au lieu de
 * rendre des octets faux. Avec un mode non authentifié (CBC), un attaquant
 * ayant accès à la base pourrait altérer le chiffré sans qu'on s'en aperçoive.
 *
 * Chaque chiffrement tire un **IV aléatoire**. Réutiliser un IV en GCM ne
 * fait pas qu'affaiblir le chiffrement : ça peut révéler la clé
 * d'authentification. C'est l'erreur classique, et elle est silencieuse.
 *
 * ── Aucun repli si la clé manque ──────────────────────────────────────────
 *
 * Contrairement au secret de désinscription, il n'y a **pas** de valeur de
 * secours. Chiffrer avec une clé devinable serait pire que de ne pas
 * chiffrer : ça donnerait l'illusion d'une protection. Sans clé, on refuse.
 */

import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto"

const ALGO = "aes-256-gcm"
const IV_BYTES = 12   // taille recommandée pour GCM
const TAG_BYTES = 16

/**
 * La clé de chiffrement, dérivée de `MAILING_TOKEN_ENC_KEY`.
 *
 * Passée par SHA-256 pour obtenir 32 octets quelle que soit la longueur
 * fournie — ce n'est pas un durcissement de mot de passe (la valeur doit être
 * aléatoire et longue), seulement une normalisation de taille.
 */
function key(): Buffer {
  const raw = (process.env.MAILING_TOKEN_ENC_KEY ?? "").trim()
  if (raw.length < 32) {
    throw new Error(
      "MAILING_TOKEN_ENC_KEY absente ou trop courte (32 caractères minimum). " +
      "Aucun jeton OAuth ne peut être stocké sans elle.",
    )
  }
  return createHash("sha256").update(raw).digest()
}

/** La clé est-elle configurée ? Pour refuser proprement, plutôt que planter. */
export function canStoreTokens(): boolean {
  try { key(); return true } catch { return false }
}

/**
 * Chiffre un jeton. Format : `iv.tag.chiffré`, en base64url.
 *
 * L'IV et le tag voyagent avec le chiffré — ils ne sont pas secrets, et les
 * stocker à part n'apporterait qu'une occasion de les désolidariser.
 */
export function encryptToken(plain: string): string {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGO, key(), iv)
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv, tag, enc].map((b) => b.toString("base64url")).join(".")
}

/**
 * Déchiffre. Renvoie `null` si la valeur est illisible ou altérée.
 *
 * `null` plutôt qu'une exception : l'appelant doit pouvoir traiter le cas
 * « ce jeton ne vaut plus rien, demande une reconnexion » comme un état
 * normal du produit. Une clé tournée, une ligne corrompue, une migration
 * ratée — ça se répare en reconnectant, pas en plantant l'envoi.
 */
export function decryptToken(payload: string): string | null {
  try {
    const [ivB64, tagB64, encB64] = payload.split(".")
    if (!ivB64 || !tagB64 || !encB64) return null
    const iv = Buffer.from(ivB64, "base64url")
    const tag = Buffer.from(tagB64, "base64url")
    const enc = Buffer.from(encB64, "base64url")
    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) return null

    const decipher = createDecipheriv(ALGO, key(), iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8")
  } catch {
    // Signature invalide, clé changée, données abîmées : indiscernables, et
    // c'est très bien — dans les trois cas la conduite est la même.
    return null
  }
}
