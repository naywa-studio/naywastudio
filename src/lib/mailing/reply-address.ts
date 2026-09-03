/**
 * L'adresse de réponse porte la CONVERSATION, pas seulement le sourceur.
 *
 * ── Le défaut que ça supprime ─────────────────────────────────────────────
 *
 * `resolve-inbound` devinait la mission d'une réponse en prenant celle du
 * **dernier message sortant** vers ce candidat. Un candidat approché pour deux
 * postes voyait donc sa réponse rattachée à la plus récente, même s'il
 * répondait à l'autre. Le fil se remplissait, rien n'échouait, et personne ne
 * s'en apercevait — la pire forme de défaut.
 *
 * Désormais le contexte voyage DANS l'adresse :
 * `sophie+k3f9d2a7@reply.naywastudio.com`. Le client de messagerie du candidat
 * n'a rien à préserver, il répond à l'adresse. On SAIT la conversation au lieu
 * de la supposer.
 *
 * Effet de bord précieux : une conversation cesse d'appartenir à une personne
 * pour appartenir au cabinet. Un collègue qui reprend un dossier réutilise le
 * même jeton, et le départ d'un sourceur ne perd plus rien.
 *
 * ── Pourquoi un jeton COURT, et tiré au sort ──────────────────────────────
 *
 * La première version encodait l'identifiant du match en base32, soit 26
 * caractères. Réversible, sans stockage — et **visible par le candidat**, dans
 * le champ « répondre à » de son message. Une adresse qui ressemble à une clé
 * de chiffrement fait douter de l'expéditeur, et c'est exactement la confiance
 * qu'on cherche à préserver.
 *
 * Huit caractères tirés au sort, stockés sur le match (migration 101). On perd
 * la réversibilité — il faut une lecture en base — et on gagne une adresse qui
 * se lit. L'unicité vient de l'index, pas de la probabilité : une collision
 * devient une erreur d'écriture visible, jamais une réponse silencieusement
 * rattachée à la mauvaise conversation.
 *
 * ── Ce que ce fichier ne fait PAS ─────────────────────────────────────────
 *
 * Il ne vérifie aucun droit. Un jeton dit « quelle conversation », jamais
 * « qui a le droit de la lire » : le rattachement vérifie que l'organisation
 * du sourceur destinataire est bien celle du match avant d'écrire quoi que ce
 * soit. Cf. `route-inbound.ts`.
 */

import { randomBytes } from "crypto"

/**
 * Alphabet sans caractères confondables.
 *
 * Ni `0`/`o`, ni `1`/`l`/`i` : cette adresse finit recopiée à la main, lue au
 * téléphone, ou relue dans une capture d'écran de support. Un jeton
 * indéchiffrable à l'œil transforme un incident de cinq minutes en enquête.
 */
const ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz"

/** Assez court pour se lire, assez long pour ne pas se deviner. */
export const TOKEN_LENGTH = 8

const TOKEN_RE = new RegExp(`^[${ALPHABET}]{${TOKEN_LENGTH}}$`)

/**
 * Un nouveau jeton de conversation.
 *
 * Tiré de `crypto.randomBytes` et non de `Math.random` : ce jeton voyage chez
 * le candidat et sert à rattacher un message dans le fil d'un cabinet. Un
 * générateur prévisible permettrait de fabriquer des adresses valides.
 *
 * Le modulo introduit un biais négligeable (256 % 31), sans importance ici :
 * l'unicité est garantie par l'index, pas par l'uniformité du tirage.
 */
export function newReplyToken(): string {
  const bytes = randomBytes(TOKEN_LENGTH)
  let out = ""
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length]
  return out
}

/**
 * L'adresse de réponse pour une conversation donnée.
 *
 * Sans jeton — un message hors mission — on renvoie l'adresse telle quelle :
 * mieux vaut l'ancien comportement qu'une adresse bancale.
 */
export function replyAddressFor(inboxAddress: string, token: string | null | undefined): string {
  const at = inboxAddress.lastIndexOf("@")
  if (at < 1 || !token || !TOKEN_RE.test(token)) return inboxAddress

  const local = inboxAddress.slice(0, at)
  const domain = inboxAddress.slice(at + 1)

  /* Garde-fou : la partie locale d'une adresse est limitée à 64 caractères
   * (RFC 5321). Neuf caractères de plus ne peuvent dépasser que pour un
   * sourceur au nom très long — et dans ce cas on renonce au jeton plutôt que
   * de fabriquer une adresse invalide. Perdre la précision du rattachement est
   * réparable ; un message qui rebondit n'atteint jamais le candidat. */
  if (local.length + 1 + token.length > 64) return inboxAddress

  return `${local}+${token}@${domain}`
}

export interface ParsedReplyAddress {
  /** L'adresse sans son suffixe : celle qui identifie le sourceur. */
  base: string
  /** Le jeton de conversation, si l'adresse en portait un. */
  token: string | null
}

/**
 * Décompose une adresse reçue.
 *
 * Le repli — `token: null` — n'est pas un cas d'erreur : c'est le cas NORMAL
 * pour toute réponse à un message envoyé avant le sous-adressage. Elles
 * doivent continuer d'arriver, sans quoi une mise en production perdrait en
 * silence les échanges en cours.
 */
export function parseReplyAddress(address: string): ParsedReplyAddress {
  const clean = address.trim().toLowerCase()
  const at = clean.lastIndexOf("@")
  if (at < 1) return { base: clean, token: null }

  const local = clean.slice(0, at)
  const domain = clean.slice(at + 1)
  const plus = local.indexOf("+")
  if (plus < 0) return { base: clean, token: null }

  const suffix = local.slice(plus + 1)
  return {
    base: `${local.slice(0, plus)}@${domain}`,
    /* Un suffixe qui n'a pas la forme d'un jeton — un « +test » ajouté à la
     * main par un candidat, l'ancien jeton de 26 caractères — ne doit pas
     * faire perdre le message : on le traite comme une adresse sans suffixe,
     * et la déduction reprend la main. */
    token: TOKEN_RE.test(suffix) ? suffix : null,
  }
}
