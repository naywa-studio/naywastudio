/**
 * Validation du domaine saisi par le client.
 *
 * Cette chaîne est saisie à la main, puis devient : un nom DNS déclaré chez le
 * fournisseur, une partie d'adresse d'expédition, et une clé d'unicité entre
 * organisations. Elle mérite d'être vérifiée avant tout ça, et pas après.
 */

/** Ce qu'on refuse, et pourquoi. */
export type DomainRejection =
  | "empty"
  | "malformed"
  /** Une IP, un « localhost », un TLD seul : rien qui puisse porter du DKIM. */
  | "not_a_domain"
  /** Le domaine de Naywa. Un client ne revendique pas notre identité. */
  | "reserved"
  | "too_long"

export interface DomainCheck {
  ok: boolean
  /** Domaine normalisé : minuscules, sans schéma, sans point final. */
  value: string
  reason?: DomainRejection
}

/** Domaines que Naywa se réserve, avec leurs sous-domaines. */
const RESERVED = ["naywastudio.com", "naywa.studio"]

/**
 * Domaines que PERSONNE ne peut revendiquer, admin compris.
 *
 * `mail.naywastudio.com` porte le SMTP de Supabase : confirmations
 * d'inscription et réinitialisations de mot de passe. Le déclarer comme
 * domaine d'envoi d'une organisation reviendrait à détourner
 * l'authentification de tous les utilisateurs. La racine, elle, porte la
 * messagerie professionnelle (MX Lark).
 */
const NEVER = ["naywastudio.com", "mail.naywastudio.com", "naywa.studio"]

/**
 * Normalise et valide une racine de domaine.
 *
 * Tolérante à la saisie (`https://`, `www.`, majuscules, espaces, point final
 * — tout ce qu'un copier-coller d'URL apporte), stricte sur le résultat.
 */
export function checkRootDomain(
  input: string | null | undefined,
  /**
   * Un admin Naywa peut déclarer un sous-domaine de `naywastudio.com`.
   *
   * Uniquement pour éprouver la chaîne : Elyas n'a qu'un domaine, et sans
   * cette porte la mise en route ne peut être testée qu'en en achetant un
   * second. La garde reste entière pour les clients — et deux domaines
   * restent interdits à TOUT LE MONDE (cf. `NEVER`), parce que les détourner
   * couperait l'authentification ou la messagerie de Naywa.
   */
  opts?: { isAdmin?: boolean },
): DomainCheck {
  const value = (input ?? "")
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "")   // schéma collé depuis la barre d'adresse
    .replace(/[/?#].*$/, "")       // chemin, requête, ancre
    .replace(/^www\./, "")
    .replace(/\.+$/, "")           // point final d'un FQDN absolu

  if (!value) return { ok: false, value, reason: "empty" }
  if (value.length > 190) return { ok: false, value, reason: "too_long" }

  // Une adresse IP ne porte pas de DKIM, et « localhost » non plus.
  if (/^\d+(\.\d+)*$/.test(value) || value === "localhost") {
    return { ok: false, value, reason: "not_a_domain" }
  }

  // Au moins deux étiquettes, chacune alphanumérique avec tirets internes.
  const labels = value.split(".")
  if (labels.length < 2) return { ok: false, value, reason: "not_a_domain" }
  const label = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/
  if (!labels.every((l) => label.test(l))) return { ok: false, value, reason: "malformed" }
  // Le TLD ne peut pas être numérique (sinon « 1.2 » passerait).
  if (/^\d+$/.test(labels[labels.length - 1])) return { ok: false, value, reason: "not_a_domain" }

  // Interdits absolus, avant toute exception : la porte admin ne les ouvre pas.
  if (NEVER.includes(value)) return { ok: false, value, reason: "reserved" }

  if (!opts?.isAdmin && RESERVED.some((r) => value === r || value.endsWith(`.${r}`))) {
    return { ok: false, value, reason: "reserved" }
  }

  return { ok: true, value }
}

/** Message destiné au client, en français, sans jargon. */
export function explainRejection(reason: DomainRejection): string {
  switch (reason) {
    case "empty":
      return "Indiquez le nom de domaine de votre organisation."
    case "too_long":
      return "Ce nom de domaine est trop long."
    case "reserved":
      return "Ce domaine appartient à Naywa. Indiquez celui de votre organisation."
    case "not_a_domain":
      return "Indiquez un nom de domaine, par exemple « cabinet-durand.fr »."
    case "malformed":
      return "Ce nom de domaine contient des caractères inattendus."
  }
}

/**
 * Sous-domaine d'envoi saisi par le client.
 *
 * Une seule étiquette, jamais un chemin : « careers », pas « careers.mail ».
 * Renvoie `null` si la saisie est inutilisable — l'appelant retombe alors sur
 * la valeur par défaut plutôt que de refuser, parce que ce champ est
 * facultatif et qu'aucun client ne devrait être bloqué dessus.
 */
export function cleanSubdomain(input: string | null | undefined): string | null {
  const value = (input ?? "").trim().toLowerCase().replace(/^\.+|\.+$/g, "")
  if (!value) return null
  if (!/^[a-z0-9]([a-z0-9-]{0,30}[a-z0-9])?$/.test(value)) return null
  return value
}
