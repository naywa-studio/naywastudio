/**
 * L'envoi d'un email CANDIDAT, depuis le domaine du client.
 *
 * ── Ce que ce fichier garde ───────────────────────────────────────────────
 *
 * Règle produit : **le domaine du client, ou rien.** Jamais de repli
 * silencieux sur un domaine Naywa. Un candidat qui reçoit un message signé
 * d'une marque que le cabinet n'a pas choisie, c'est une usurpation de son
 * identité commerciale — et un mail non authentifié part en spam, ce qui est
 * pire que ne pas l'envoyer : le cabinet croit avoir contacté quelqu'un.
 *
 * ── Ce qui ne passe PAS par ici ───────────────────────────────────────────
 *
 * ⚠️ Les emails que Naywa envoie EN SON NOM — confirmations d'inscription,
 * réinitialisations de mot de passe (SMTP Supabase), contact, support —
 * continuent de partir par `mail.naywastudio.com` via `lib/resend.ts`.
 * Ils n'ont rien à faire ici, et débrancher ce relais couperait
 * l'authentification de tous les utilisateurs.
 *
 * Seul l'outreach CANDIDAT bascule sur le domaine du client.
 */

import type { Organization } from "../database.types"
import { canSendFromOrgDomain } from "../subscription"
import { sesProvider } from "./ses"
import { cleanLocalPart } from "./domain-input"
import { DEFAULT_FROM_LOCAL, type MailingProvider } from "./provider"

/**
 * Le fournisseur actif.
 *
 * Point de bascule unique : c'est ici, et nulle part ailleurs, qu'on change de
 * fournisseur. Le reste du code ne connaît que l'interface.
 */
export function activeProvider(): MailingProvider {
  return sesProvider
}

/** Champs de l'org nécessaires pour décider et construire un envoi. */
export type MailingOrg = Pick<
  Organization,
  | "id" | "trial_ends_at" | "subscription_status" | "current_period_end"
  | "subscription_has_mailing" | "mailing_status" | "mailing_sending_domain"
  | "mailing_subdomain" | "mailing_from_local"
>

export type SendRefusal =
  /** L'option n'est pas acquise (ou l'accès est suspendu). */
  | "mailing_not_included"
  /** Option acquise, mais le domaine n'est pas encore vérifié. */
  | "domain_not_ready"

export interface CandidateEmailInput {
  org: MailingOrg
  /** Nom affiché de l'expéditeur — le sourceur, pas Naywa. */
  senderName: string | null | undefined
  /** Où le candidat répond : l'adresse de réception du sourceur. */
  replyTo: string
  to: string
  subject: string
  text: string
  html?: string
  /** Copie au sourceur, s'il a coché `inbox_cc_self`. */
  bcc?: string
}

export type SendCandidateResult =
  | { ok: true; id: string }
  | { ok: false; reason: SendRefusal }

/**
 * Adresse d'envoi de l'organisation, ex. `recrutement@careers.cabinet-durand.fr`.
 *
 * ── Ce que cette fonction a corrigé ───────────────────────────────────────
 *
 * La partie locale reprenait le SOUS-DOMAINE, au motif que le domaine portait
 * déjà l'identité du cabinet. Résultat lu par chaque candidat :
 * `careers@careers.cabinet-durand.fr`. Le mot deux fois, ce qui ne se lit pas
 * comme un choix mais comme une configuration bâclée — sur l'unique chaîne que
 * l'add-on met sous les yeux du destinataire.
 *
 * Le cabinet choisit désormais la sienne (`mailing_from_local`). Le défaut ne
 * dépend plus du sous-domaine : les deux répondent à des questions
 * différentes — d'où l'on envoie, et qui envoie.
 */
export function orgFromAddress(
  org: Pick<MailingOrg, "mailing_sending_domain" | "mailing_from_local"> | null | undefined,
): string | null {
  if (!org?.mailing_sending_domain) return null
  const local = cleanLocalPart(org.mailing_from_local) ?? DEFAULT_FROM_LOCAL
  return `${local}@${org.mailing_sending_domain}`
}

/**
 * En-tête From : le nom du sourceur, l'adresse du cabinet.
 *
 * Deux filtrages, pour deux attaques différentes :
 *
 *  - guillemets, chevrons et sauts de ligne → empêchent de refermer l'en-tête
 *    pour en injecter un autre (un `Bcc:`, typiquement) ;
 *  - **l'arobase** → empêche d'écrire une fausse adresse DANS le nom affiché.
 *    Sans elle, `Sophie x@evil.com` s'afficherait tel quel chez le candidat,
 *    qui lirait un expéditeur qui n'est pas l'expéditeur réel. Aucun nom de
 *    personne ne contient d'arobase : le filtre ne coûte rien.
 *
 * Trouvé par le test d'injection, pas en relisant.
 */
export function candidateFromHeader(senderName: string | null | undefined, address: string): string {
  const name = (senderName ?? "")
    .replace(/["<>@\r\n]/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
  return name ? `${name} <${address}>` : address
}

/**
 * Envoie un email candidat, ou refuse explicitement.
 *
 * Ne jette pas sur un refus MÉTIER — l'appelant doit pouvoir distinguer « pas
 * abonné » de « domaine pas prêt » pour afficher le bon message. Une panne du
 * fournisseur, elle, remonte bien en exception : ce n'est pas la même chose et
 * ça ne se traite pas pareil.
 */
export async function sendCandidateEmail(
  input: CandidateEmailInput,
  opts?: { isAdmin?: boolean },
): Promise<SendCandidateResult> {
  const { org } = input

  // Deux refus distincts, dans cet ordre : « a-t-il payé ? » puis « son
  // domaine est-il prêt ? ». Les confondre donnerait un message trompeur —
  // proposer de souscrire à quelqu'un qui a déjà payé, par exemple.
  if (!canSendFromOrgDomain(org, opts)) {
    const paid = org.subscription_has_mailing === true || opts?.isAdmin === true
    return { ok: false, reason: paid ? "domain_not_ready" : "mailing_not_included" }
  }

  const from = orgFromAddress(org)
  // Défensif : `canSendFromOrgDomain` l'a déjà vérifié. Mais laisser un
  // `null!` traverser produirait un envoi depuis "null@..." plutôt qu'une
  // erreur — sur un document qui part chez un candidat, on préfère l'erreur.
  if (!from) return { ok: false, reason: "domain_not_ready" }

  const { id } = await activeProvider().sendFromDomain({
    from: candidateFromHeader(input.senderName, from),
    to: input.to,
    replyTo: input.replyTo,
    subject: input.subject,
    text: input.text,
    html: input.html,
    bcc: input.bcc,
    // Un jeu de configuration par organisation : la réputation est partagée
    // au niveau du compte, c'est ce qui permet de mesurer chaque client
    // séparément et de couper le fautif sans toucher aux autres.
    reputationGroup: reputationGroupFor(org.id),
  })
  return { ok: true, id }
}

/**
 * Nom du jeu de configuration d'une organisation.
 *
 * Dérivé de l'identifiant plutôt que du nom du cabinet : un nom se renomme, et
 * le regroupement de réputation doit survivre à un changement de raison
 * sociale. SES n'accepte que lettres, chiffres, tirets et underscores.
 */
export function reputationGroupFor(orgId: string): string {
  return `org-${orgId.replace(/[^a-zA-Z0-9_-]/g, "")}`
}
