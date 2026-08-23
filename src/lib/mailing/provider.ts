/**
 * Le fournisseur d'envoi, derrière une interface étroite.
 *
 * ── Pourquoi cette couche existe ──────────────────────────────────────────
 *
 * Ce n'est pas de l'abstraction par principe. C'est une assurance, prise après
 * un comparatif qui a éliminé Postmark et Mailgun — non pas sur le prix, mais
 * parce qu'ils **interdisent l'outreach** et suspendent les comptes qui en
 * font. SES sanctionne des chiffres (rebonds, plaintes) plutôt qu'une
 * catégorie d'usage, ce qui le rend compatible ; mais un fournisseur d'email
 * reste quelque chose qui peut vous couper du jour au lendemain.
 *
 * Or l'add-on est vendu au client. S'il tombe, il ne doit pas tomber
 * longtemps. Quatre fonctions derrière une interface, et changer de
 * fournisseur redevient un fichier à écrire au lieu d'une réécriture.
 *
 * ── Et ce que ça rend possible ────────────────────────────────────────────
 *
 * DKIM fonctionne par SÉLECTEURS : chaque fournisseur publie ses clés sous des
 * noms différents. On peut donc publier simultanément celles de deux
 * fournisseurs dans la même zone, et basculer l'envoi **sans aucune
 * modification DNS, sans propagation à attendre**. Le second reste préparé et
 * dormant. (Idée d'Elyas ; à câbler au lot de secours, pas ici.)
 *
 * ── Ce que cette couche ne fait PAS ───────────────────────────────────────
 *
 * Elle ne décide pas si l'envoi est autorisé. C'est le rôle de
 * `canSendFromOrgDomain` : option acquise ET domaine vérifié. Mélanger les
 * deux ferait partir un mail candidat depuis un domaine sans clés publiées —
 * droit en spam, sous la marque du client.
 */

/** État du domaine d'envoi, tel que stocké dans `organizations.mailing_status`. */
export type MailingStatus =
  /** Créé chez nous, rien n'est encore parti chez le fournisseur. */
  | "pending"
  /** Le fournisseur attend que les enregistrements soient publiés. */
  | "awaiting_dns"
  /** Publiés, le fournisseur contrôle. */
  | "verifying"
  /** Vérifié : l'envoi est débloqué. Le SEUL état qui l'autorise. */
  | "active"
  /** Échec durable — le client doit reprendre la mise en route. */
  | "failed"

/**
 * Un enregistrement DNS à publier pour authentifier le domaine.
 *
 * `name` est TOUJOURS le nom complet (`sel._domainkey.careers.client.fr`), et
 * jamais relatif : selon l'hébergeur DNS, un nom relatif se voit suffixer la
 * zone une seconde fois. On normalise ici pour que l'écriture automatique
 * comme l'affichage au client partent de la même valeur.
 */
export interface MailingDnsRecord {
  type: "CNAME" | "TXT" | "MX"
  name: string
  value: string
  /** MX seulement. */
  priority?: number
}

/** Le domaine d'envoi tel que le fournisseur le connaît. */
export interface SendingDomain {
  /** Identifiant chez le fournisseur (`mailing_provider_domain_id`). */
  id: string
  /** Le domaine lui-même, ex. "careers.cabinet-durand.fr". */
  name: string
  status: MailingStatus
  /** Enregistrements à publier. Vide une fois le domaine vérifié. */
  records: MailingDnsRecord[]
}

export interface ProviderSendInput {
  /** En-tête From complet, ex. `Sophie Durand <careers@cabinet-durand.fr>`. */
  from: string
  to: string
  replyTo: string
  subject: string
  text: string
  html?: string
  /**
   * Copie invisible au sourceur, quand il a demandé à recevoir ses propres
   * envois (`profiles.inbox_cc_self`). Optionnelle, mais elle doit exister
   * ici : c'est un réglage que l'utilisateur a coché, et qui disparaîtrait
   * sans bruit le jour où son organisation bascule sur son domaine.
   */
  bcc?: string
  /**
   * Regroupement de réputation, un par CLIENT.
   *
   * Chez SES, tous les clients partagent la réputation du compte : un cabinet
   * qui envoie n'importe quoi dégrade la délivrabilité des autres, et au pire
   * fait suspendre l'ensemble. Rattaché à un jeu de configuration par client,
   * on mesure chacun séparément et on peut couper le fautif SEUL — avant que
   * le fournisseur ne s'en aperçoive.
   */
  reputationGroup?: string
}

/**
 * Le contrat que tout fournisseur doit remplir. Quatre gestes, pas un de plus :
 * déclarer un domaine, lire son état, relancer un contrôle, envoyer.
 */
export interface MailingProvider {
  /** Nom court, journalisé pour savoir qui a envoyé quoi après un basculement. */
  readonly name: string
  /** Déclare le domaine et renvoie les enregistrements à publier. Idempotent :
   *  un domaine déjà déclaré est renvoyé tel quel, jamais recréé — recréer
   *  ferait tourner les clés DKIM et casserait un domaine en production. */
  createSendingDomain(domain: string): Promise<SendingDomain>
  /** État courant. `null` si le fournisseur ne connaît pas ce domaine. */
  getSendingDomain(domain: string): Promise<SendingDomain | null>
  /** Redemande un contrôle immédiat (bouton « Vérifier » de l'UI). */
  verifySendingDomain(domain: string): Promise<SendingDomain>
  sendFromDomain(input: ProviderSendInput): Promise<{ id: string }>
}

/** Le domaine d'envoi complet, à partir de la racine et du sous-domaine. */
export function sendingDomainFor(root: string, subdomain: string | null | undefined): string {
  const sub = (subdomain ?? "").trim().replace(/^\.+|\.+$/g, "") || DEFAULT_SUBDOMAIN
  return `${sub}.${root.trim().toLowerCase().replace(/^\.+|\.+$/g, "")}`
}

/**
 * Sous-domaine d'envoi par défaut.
 *
 * On n'envoie JAMAIS depuis la racine du domaine client : sa réputation sert
 * déjà à sa messagerie interne. Un incident sur du sourcing ne doit pas
 * pouvoir dégrader les emails que le cabinet échange avec ses propres clients.
 */
export const DEFAULT_SUBDOMAIN = "careers"

/**
 * Partie locale par défaut de l'adresse d'expédition.
 *
 * Elle reprenait le sous-domaine, ce qui donnait
 * `careers@careers.cabinet-durand.fr` — le mot deux fois, en tête de chaque
 * message reçu par un candidat. C'est la chaîne la plus lue de tout l'add-on,
 * et elle avait l'air d'une erreur de configuration.
 *
 * « recrutement » dit ce que c'est. Le cabinet peut la remplacer par ce qu'il
 * veut — `contact`, `sophie`, le nom de son équipe — sans rien republier :
 * la partie locale d'une adresse ne s'authentifie pas, seul le domaine le
 * fait. C'est le seul réglage de ce chantier qui se change à chaud.
 */
export const DEFAULT_FROM_LOCAL = "recrutement"
