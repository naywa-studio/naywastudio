/**
 * Retrouver la conversation par l'OBJET du message.
 *
 * ── Pourquoi ce mécanisme, et pas un jeton dans l'adresse ─────────────────
 *
 * Une adresse `elyas+97w26uu2@reply.naywastudio.com` rattache à coup sûr — et
 * elle est VISIBLE par le candidat, dans son champ « répondre à ». Elle
 * ressemble à un mouchard, sur un message dont tout l'enjeu est d'inspirer
 * confiance.
 *
 * ── Pourquoi pas `In-Reply-To`, qui serait invisible ──────────────────────
 *
 * Parce qu'il faudrait connaître l'identifiant RFC de NOTRE message sortant.
 * Ce sont les fournisseurs qui l'attribuent : Gmail et Graph ne le rendent
 * pas, et écrasent celui qu'on poserait. On ne peut donc pas rattacher la
 * PREMIÈRE réponse d'un candidat — celle qui compte le plus. Ce chemin ne sert
 * qu'à partir du deuxième échange, où l'on reconnaît nos propres entrants.
 *
 * ── Ce que l'objet donne, et ce qu'il ne donne pas ────────────────────────
 *
 * Il fonctionne dès la première réponse, sans rien afficher au candidat. Ce
 * n'est pas une certitude : deux missions peuvent porter le même objet, et un
 * candidat peut réécrire le sien. Dans ces cas, on retombe sur la déduction
 * par le dernier message sortant — c'est-à-dire le comportement d'avant, donc
 * jamais pire.
 *
 * ── Le vrai travail est la NORMALISATION ──────────────────────────────────
 *
 * Chaque messagerie empile son propre préfixe, dans sa propre langue, parfois
 * plusieurs fois : `Re: Re: TR: Objet`. Outlook allemand écrit `AW:`, le
 * néerlandais `Antw:`, et certains ajoutent un compteur `Re[2]:`. Comparer
 * sans nettoyer ne rattacherait quasiment jamais rien — l'échec serait
 * silencieux, et on conclurait que le mécanisme ne marche pas.
 */

/** Préfixes de réponse et de transfert, toutes messageries confondues. */
const PREFIX_RE = /^\s*(?:(?:re|ré|rép|rep|aw|antw|sv|vs|vb|fw|fwd|tr|wg|rv|enc)\s*(?:\[\d+\])?\s*:\s*)+/i

/**
 * L'objet ramené à sa forme comparable.
 *
 * Les espaces multiples sont réduits : certaines messageries replient un objet
 * long sur plusieurs lignes, ce qui y injecte des espaces et des tabulations
 * absents de l'original.
 */
export function normalizeSubject(subject: string | null | undefined): string {
  let s = (subject ?? "").replace(/[\r\n\t]+/g, " ")
  // En boucle : un objet peut porter `Re: TR: Re: …`, et une seule passe
  // laisserait les préfixes suivants.
  let previous: string
  do {
    previous = s
    s = s.replace(PREFIX_RE, "")
  } while (s !== previous)
  return s.replace(/\s+/g, " ").trim().toLowerCase()
}

/** Un message sortant, réduit à ce dont le rapprochement a besoin. */
export interface OutboundCandidate {
  job_id: string | null
  subject: string | null
  created_at: string
}

/**
 * La mission du message sortant dont l'objet correspond.
 *
 * `undefined` — et non `null` — quand aucun rapprochement n'est possible :
 * l'appelant doit pouvoir distinguer « je n'ai rien trouvé, déduis » de « j'ai
 * trouvé un message sans mission ». Confondre les deux ferait taire la
 * déduction là où elle est encore utile.
 */
export function jobFromSubject(
  replySubject: string | null | undefined,
  outbound: OutboundCandidate[],
): string | null | undefined {
  const target = normalizeSubject(replySubject)
  if (!target) return undefined

  const matches = outbound.filter((m) => normalizeSubject(m.subject) === target)
  if (matches.length === 0) return undefined

  /* Plusieurs missions au même objet : on ne tranche PAS. Choisir au hasard
   * rattacherait une réponse sur deux à la mauvaise conversation, en silence —
   * exactement le défaut qu'on cherche à supprimer. La déduction reprend la
   * main, et elle a le mérite d'être un comportement connu. */
  const jobs = new Set(matches.map((m) => m.job_id))
  if (jobs.size > 1) return undefined

  return matches[0].job_id
}
