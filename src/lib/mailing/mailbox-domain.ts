/**
 * Quelle boîte un membre a-t-il le droit de connecter ?
 *
 * ── Ce qu'on empêche ──────────────────────────────────────────────────────
 *
 * Qu'un sourceur branche son adresse personnelle et écrive aux candidats du
 * cabinet depuis `prenom.nom@gmail.com`. Le cabinet perd la main sur ce qui
 * part en son nom, et le jour où la personne s'en va, la relation part avec
 * elle — le cabinet n'a même pas trace de ce qui a été dit.
 *
 * ── Le piège qu'on évite en même temps ────────────────────────────────────
 *
 * Une liste noire de fournisseurs grand public (`gmail.com`, `outlook.com`…)
 * paraît la réponse évidente. Elle est fausse : un cabinet d'une personne
 * travaille très légitimement depuis son Gmail, et le bloquer le priverait de
 * l'add-on qu'il vient de payer. On ne juge donc pas le domaine en soi, on le
 * compare à ce que le cabinet a déjà déclaré.
 *
 * ── La règle ──────────────────────────────────────────────────────────────
 *
 * La boîte doit partager son domaine avec l'un des trois repères que le
 * cabinet a lui-même posés :
 *
 *  1. **l'adresse du compte Naywa du membre** — c'est l'owner qui a choisi
 *     qui inviter, et à quelle adresse. C'est le repère le plus fiable, et il
 *     ne demande aucun réglage ;
 *  2. **l'adresse de contact de l'organisation** (branding, verrouillée) ;
 *  3. **le domaine d'envoi** du cabinet, s'il en a configuré un.
 *
 * Un solo inscrit en `jean@gmail.com` peut donc connecter son Gmail — c'est
 * bien son adresse professionnelle. Une sourceuse invitée à
 * `marie@cabinet.fr` ne peut pas connecter son Gmail personnel. Les deux
 * comportements sont justes, et la règle n'a demandé aucune configuration.
 */

/** Le domaine d'une adresse, en minuscules. `null` si l'adresse est inexploitable. */
export function domainOf(email: string | null | undefined): string | null {
  const at = (email ?? "").trim().toLowerCase().lastIndexOf("@")
  if (at < 1) return null
  const domain = (email ?? "").trim().toLowerCase().slice(at + 1)
  return domain.includes(".") ? domain : null
}

export interface MailboxDomainContext {
  /** L'adresse du compte Naywa du membre qui connecte. */
  accountEmail: string | null | undefined
  /** `organizations.contact_email`. */
  orgContactEmail: string | null | undefined
  /** `organizations.mailing_sending_domain`, ex. `careers.cabinet.fr`. */
  orgSendingDomain: string | null | undefined
}

/**
 * Les domaines acceptés, dans l'ordre où on les proposera au sourceur.
 *
 * Le domaine d'envoi est un SOUS-domaine (`careers.cabinet.fr`) : on accepte
 * aussi sa racine, faute de quoi un cabinet ayant configuré son envoi ne
 * pourrait pas connecter les boîtes de ses propres salariés.
 */
export function allowedMailboxDomains(ctx: MailboxDomainContext): string[] {
  const out: string[] = []
  const push = (d: string | null) => { if (d && !out.includes(d)) out.push(d) }

  push(domainOf(ctx.accountEmail))
  push(domainOf(ctx.orgContactEmail))

  const sending = (ctx.orgSendingDomain ?? "").trim().toLowerCase()
  if (sending) {
    push(sending)
    /* `careers.cabinet.fr` → `cabinet.fr`. On ne remonte que d'un cran : une
     * remontée complète finirait par accepter `fr`, donc tout le pays. */
    const parts = sending.split(".")
    if (parts.length > 2) push(parts.slice(1).join("."))
  }

  return out
}

export interface MailboxDomainVerdict {
  allowed: boolean
  /** Le domaine refusé, pour pouvoir le nommer dans le message. */
  domain: string | null
  /** Ce qui aurait été accepté. Un refus sans cette liste est incompréhensible. */
  expected: string[]
}

export function checkMailboxDomain(
  mailboxEmail: string,
  ctx: MailboxDomainContext,
): MailboxDomainVerdict {
  const domain = domainOf(mailboxEmail)
  const expected = allowedMailboxDomains(ctx)

  /* Aucun repère connu : on laisse passer. Refuser ici bloquerait un cabinet
   * dont les données sont simplement incomplètes, pour prévenir un abus qu'on
   * n'a aucun moyen de caractériser. Le silence vaut mieux qu'un mur arbitraire. */
  if (expected.length === 0) return { allowed: true, domain, expected }

  if (!domain) return { allowed: false, domain: null, expected }
  return { allowed: expected.includes(domain), domain, expected }
}
