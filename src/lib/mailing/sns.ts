/**
 * Vérification des notifications Amazon SNS.
 *
 * ── Pourquoi ce fichier est critique ──────────────────────────────────────
 *
 * SES dépose les emails entrants et prévient l'application par une requête
 * HTTP publique. **Rien n'empêche quiconque d'envoyer la même requête.** Sans
 * vérification, un tiers injecterait de faux messages dans les fils de
 * discussion des clients — de fausses réponses de candidats, attribuées à des
 * personnes réelles, dans un outil de recrutement.
 *
 * Ce n'est donc pas une formalité : c'est la seule chose qui distingue une
 * notification d'Amazon d'une requête forgée.
 *
 * ── Comment SNS signe ─────────────────────────────────────────────────────
 *
 * Chaque message porte une signature RSA-SHA (`Signature`) et l'URL du
 * certificat qui permet de la vérifier (`SigningCertURL`). La vérification
 * porte sur une chaîne canonique : certains champs, dans un ordre imposé, qui
 * dépend du type de message.
 *
 * ── Le piège, et il est réel ──────────────────────────────────────────────
 *
 * `SigningCertURL` vient du message lui-même, donc de l'attaquant potentiel.
 * Aller chercher un certificat à l'URL qu'il indique, c'est lui laisser
 * fournir sa propre clé — et toute signature devient valide.
 *
 * D'où le contrôle strict du domaine AVANT toute requête : uniquement HTTPS,
 * uniquement un hôte `sns.<region>.amazonaws.com`. C'est l'erreur classique
 * sur ce mécanisme, et elle annule entièrement la protection.
 */

import { createVerify } from "node:crypto"

/** Message SNS, tel qu'il arrive dans le corps de la requête. */
export interface SnsMessage {
  Type: string
  MessageId?: string
  Token?: string
  TopicArn?: string
  Subject?: string
  Message?: string
  Timestamp?: string
  SignatureVersion?: string
  Signature?: string
  SigningCertURL?: string
  SubscribeURL?: string
}

/**
 * L'URL du certificat est-elle un hôte SNS légitime ?
 *
 * Exporté pour être testé directement : c'est le contrôle dont dépend tout le
 * reste, et il doit rester lisible.
 */
export function isTrustedCertUrl(raw: string | undefined): boolean {
  if (!raw) return false
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return false
  }
  // HTTPS obligatoire : en HTTP, le certificat pourrait être remplacé en
  // transit, ce qui reviendrait au même que de faire confiance à l'attaquant.
  if (url.protocol !== "https:") return false
  // Ancrage sur la FIN du nom d'hôte. Une simple recherche de sous-chaîne
  // laisserait passer `sns.eu-west-1.amazonaws.com.evil.net`.
  return /^sns\.[a-z0-9-]+\.amazonaws\.com$/.test(url.hostname)
}

/**
 * Champs signés, dans l'ordre imposé par SNS.
 *
 * L'ordre n'est pas indifférent : la chaîne canonique est reconstruite à
 * l'identique des deux côtés. Un champ de plus, de moins, ou déplacé, et la
 * signature ne correspond plus.
 */
const SIGNED_KEYS: Record<string, string[]> = {
  Notification: ["Message", "MessageId", "Subject", "Timestamp", "TopicArn", "Type"],
  SubscriptionConfirmation: ["Message", "MessageId", "SubscribeURL", "Timestamp", "Token", "TopicArn", "Type"],
  UnsubscribeConfirmation: ["Message", "MessageId", "SubscribeURL", "Timestamp", "Token", "TopicArn", "Type"],
}

function canonicalString(msg: SnsMessage): string | null {
  const keys = SIGNED_KEYS[msg.Type]
  if (!keys) return null
  let out = ""
  for (const key of keys) {
    const value = (msg as unknown as Record<string, unknown>)[key]
    // `Subject` est facultatif : absent, il est simplement omis — et non
    // représenté par une chaîne vide, qui produirait une autre empreinte.
    if (value === undefined || value === null) continue
    out += `${key}\n${String(value)}\n`
  }
  return out
}

/** Certificats déjà récupérés. SNS en fait tourner très peu ; les redemander
 *  à chaque notification ajouterait un aller-retour réseau au chemin critique. */
const certCache = new Map<string, string>()

async function fetchCert(url: string): Promise<string> {
  const cached = certCache.get(url)
  if (cached) return cached
  const res = await fetch(url)
  if (!res.ok) throw new Error(`SNS : certificat inaccessible (${res.status})`)
  const pem = await res.text()
  certCache.set(url, pem)
  return pem
}

export type SnsVerifyResult =
  | { ok: true }
  | { ok: false; reason: string }

/**
 * Le message vient-il réellement d'Amazon SNS ?
 *
 * Échoue explicitement plutôt que de jeter : l'appelant doit pouvoir répondre
 * 403 sans distinguer une signature invalide d'une panne — mais journaliser la
 * raison, parce qu'une signature qui ne passe pas peut aussi bien être une
 * attaque qu'une erreur de configuration.
 */
export async function verifySnsMessage(msg: SnsMessage): Promise<SnsVerifyResult> {
  if (!msg?.Type) return { ok: false, reason: "type absent" }
  if (!msg.Signature) return { ok: false, reason: "signature absente" }

  // Contrôle du domaine AVANT d'aller chercher quoi que ce soit : c'est tout
  // l'intérêt du contrôle.
  if (!isTrustedCertUrl(msg.SigningCertURL)) {
    return { ok: false, reason: "URL de certificat non fiable" }
  }

  const canonical = canonicalString(msg)
  if (canonical === null) return { ok: false, reason: `type inconnu : ${msg.Type}` }

  // SignatureVersion 1 = SHA1, 2 = SHA256. On accepte les deux : AWS émet
  // encore la version 1 sur des rubriques anciennes, et la refuser casserait
  // la réception sans rien sécuriser de plus (la clé reste celle d'Amazon).
  const algorithm = msg.SignatureVersion === "2" ? "RSA-SHA256" : "RSA-SHA1"

  try {
    const pem = await fetchCert(msg.SigningCertURL as string)
    const verifier = createVerify(algorithm)
    verifier.update(canonical, "utf8")
    const valid = verifier.verify(pem, msg.Signature, "base64")
    return valid ? { ok: true } : { ok: false, reason: "signature invalide" }
  } catch (err) {
    return { ok: false, reason: `vérification impossible : ${(err as Error).message}` }
  }
}

/** Vide le cache de certificats. Réservé aux tests. */
export function __clearCertCache(): void {
  certCache.clear()
}
