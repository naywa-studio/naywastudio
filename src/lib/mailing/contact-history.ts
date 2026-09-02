/**
 * La mémoire du cabinet : « quelqu'un a-t-il déjà écrit à cette personne ? »
 *
 * ── L'incident que ça évite ───────────────────────────────────────────────
 *
 * Le vivier est entièrement partagé, la boîte aux lettres est personnelle.
 * Trois sourceurs, trois boîtes, un seul vivier — et rien, aujourd'hui, ne
 * signale que le candidat qu'on s'apprête à approcher a reçu un message d'un
 * collègue avant-hier pour un autre poste. Le candidat, lui, le voit très
 * bien : il reçoit deux sollicitations du même cabinet à quelques jours
 * d'intervalle. C'est le seul incident vraiment coûteux de ce produit, parce
 * qu'il n'abîme pas notre logiciel — il abîme la réputation du client.
 *
 * ── Pourquoi on DÉRIVE au lieu de stocker ─────────────────────────────────
 *
 * La tentation serait une colonne `candidates.dernier_contact_par`. On ne le
 * fait pas : `email_messages` porte déjà `candidate_id`, `job_id`, `user_id`
 * et `created_at`. Une copie se désynchronise — un message supprimé, un envoi
 * échoué après l'écriture, une mission fusionnée — et une mémoire fausse est
 * pire qu'une mémoire absente : elle empêche d'écrire à quelqu'un qu'on n'a
 * jamais contacté, ou rassure à tort. La table des messages est la vérité, on
 * l'interroge.
 *
 * ── Pourquoi ce fichier ne lit pas la base ────────────────────────────────
 *
 * Il met en forme des lignes déjà lues. Les règles qui comptent — quel
 * contact prime, à partir de quand l'information devient du bruit — se
 * testent alors sans base ni jeu de données, ce qui est la seule façon de
 * garantir qu'elles restent vraies après la prochaine retouche.
 */

/** Une ligne d'`email_messages`, réduite à ce dont la mémoire a besoin. */
export interface ContactRow {
  direction: "outbound" | "inbound"
  job_id: string | null
  user_id: string
  created_at: string
}

/** Un contact passé, tel qu'il sera montré au sourceur. */
export interface PastContact {
  jobId: string | null
  userId: string
  at: string
  daysAgo: number
  /** L'auteur est-il celui qui consulte ? « Vous lui avez écrit » se dit autrement. */
  byViewer: boolean
}

export interface ContactHistory {
  /** Le dernier envoi sur LA mission ouverte. Le cas le plus grave. */
  sameMission: PastContact | null
  /** Le dernier envoi sur une AUTRE mission. */
  otherMission: PastContact | null
  /** Le candidat a-t-il déjà répondu, au cabinet, toutes missions confondues ? */
  hasReplied: boolean
  /** Nombre total de messages partis vers lui, toutes missions confondues. */
  outboundCount: number
}

/**
 * Au-delà, l'information passe en gris : on la montre, on n'alerte plus.
 *
 * Trois mois est la durée après laquelle réapprocher quelqu'un pour un autre
 * poste redevient normal — c'est même le geste attendu d'un cabinet qui suit
 * ses candidats. Alerter indéfiniment transformerait le bandeau en décor :
 * un avertissement toujours présent n'est plus lu, et le jour où il signale
 * un vrai doublon à trois jours, il passe inaperçu avec les autres.
 */
export const CONTACT_ALERT_DAYS = 90

const DAY_MS = 86_400_000

function daysBetween(iso: string, now: number): number {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return 0
  return Math.max(0, Math.floor((now - t) / DAY_MS))
}

/**
 * Reconstruit la mémoire à partir des messages d'un candidat.
 *
 * `rows` couvre TOUTES ses missions — c'est le sens même de l'unité de
 * mémoire : on écrit dans une conversation, on se souvient à l'échelle d'une
 * personne.
 */
export function summarizeContacts(
  rows: ContactRow[],
  opts: { currentJobId: string | null; viewerId: string; now?: number },
): ContactHistory {
  const now = opts.now ?? Date.now()
  const out = rows.filter((r) => r.direction === "outbound")

  const toContact = (r: ContactRow): PastContact => ({
    jobId: r.job_id,
    userId: r.user_id,
    at: r.created_at,
    daysAgo: daysBetween(r.created_at, now),
    byViewer: r.user_id === opts.viewerId,
  })

  /* Le plus RÉCENT de chaque catégorie, pas le premier. Ce que le sourceur
   * doit peser, c'est la fraîcheur de la dernière sollicitation : un premier
   * contact il y a deux ans n'engage plus rien. */
  const newest = (a: ContactRow | null, b: ContactRow): ContactRow =>
    !a || Date.parse(b.created_at) > Date.parse(a.created_at) ? b : a

  let same: ContactRow | null = null
  let other: ContactRow | null = null
  for (const r of out) {
    /* Un message sans mission compte comme « autre » : il a bien été envoyé,
     * et l'ignorer rendrait invisible tout l'historique d'avant les missions.
     * Il ne peut pas compter comme « même mission » — on n'en sait rien. */
    if (opts.currentJobId && r.job_id === opts.currentJobId) same = newest(same, r)
    else other = newest(other, r)
  }

  return {
    sameMission: same ? toContact(same) : null,
    otherMission: other ? toContact(other) : null,
    hasReplied: rows.some((r) => r.direction === "inbound"),
    outboundCount: out.length,
  }
}

/** Le degré d'attention que mérite un contact passé. */
export type ContactSeverity = "alert" | "info"

export function severityOf(contact: PastContact): ContactSeverity {
  return contact.daysAgo <= CONTACT_ALERT_DAYS ? "alert" : "info"
}
