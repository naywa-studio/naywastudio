/**
 * Vérification du secret Bearer sur les routes /api/cron/*. Comparaison à
 * temps constant (crypto.timingSafeEqual) plutôt qu'un `!==` direct — le
 * `!==` sur une string s'arrête au premier caractère différent, ce qui fuite
 * un signal temporel exploitable en théorie pour deviner CRON_SECRET
 * caractère par caractère. Risque pratique très faible ici (HTTPS + secret
 * hex 32 octets), mais coût de fix nul.
 */

import { timingSafeEqual } from "crypto"

export function verifyCronSecret(req: Request): boolean {
  const secret = (process.env.CRON_SECRET ?? "").trim()
  if (!secret) return false

  const provided = req.headers.get("authorization") ?? ""
  const expected = `Bearer ${secret}`

  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  // timingSafeEqual exige des buffers de même longueur — une longueur
  // différente est déjà une preuve de secret invalide, pas besoin de la
  // comparer en temps constant (elle ne dépend pas du contenu du secret).
  if (a.length !== b.length) return false

  return timingSafeEqual(a, b)
}
