/**
 * Jeton signé identifiant un candidat pour le self-service RGPD
 * (`/privacy-request/[token]`, Slice 6.2 — utilisé dès la 6.1 pour générer
 * le lien envoyé par email de confirmation).
 *
 * Même principe que `unsubscribeToken` du chantier Mailing (pas repris
 * directement : ce code n'existe pas sur cette branche, cf. conversation) —
 * un HMAC plutôt qu'une ligne en base : rien à stocker, le jeton se
 * revérifie à la lecture, infalsifiable sans le secret serveur.
 */

import { createHmac, timingSafeEqual } from "node:crypto"

function secret(): string | null {
  const dedicated = (process.env.CANDIDATE_PRIVACY_TOKEN_SECRET ?? "").trim()
  if (dedicated) return dedicated
  // Filet : réutilise CRON_SECRET plutôt que de bloquer la fonctionnalité si
  // personne n'a encore posé de secret dédié. À poser explicitement en prod.
  const fallback = (process.env.CRON_SECRET ?? "").trim()
  return fallback || null
}

export function hasCandidatePrivacyTokenSecret(): boolean {
  return secret() !== null
}

function sign(payload: string, key: string): string {
  return createHmac("sha256", key).update(payload).digest("base64url")
}

/** Jeton pour un candidat donné. `null` si aucun secret n'est configuré —
 *  mieux vaut omettre le lien que d'en signer un avec une valeur vide que
 *  n'importe qui pourrait reproduire. */
export function candidatePrivacyToken(candidateId: string): string | null {
  const key = secret()
  if (!key) return null
  const payload = candidateId
  return `${Buffer.from(payload, "utf8").toString("base64url")}.${sign(payload, key)}`
}

/** Vérifie un jeton et renvoie le candidate_id qu'il porte, ou `null` s'il
 *  est invalide/forgé. Comparaison à temps constant. */
export function verifyCandidatePrivacyToken(token: string): string | null {
  const key = secret()
  if (!key) return null
  const [encoded, sig] = token.split(".")
  if (!encoded || !sig) return null

  let payload: string
  try {
    payload = Buffer.from(encoded, "base64url").toString("utf8")
  } catch {
    return null
  }
  if (!payload) return null

  const expected = sign(payload, key)
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  return payload
}
