/**
 * L'adresse de RÉCEPTION d'un sourceur — celle où les candidats répondent.
 *
 * ── Pourquoi ce fichier existe ────────────────────────────────────────────
 *
 * Cette adresse vivait dans `lib/resend.ts`, avec le domaine Naywa en dur.
 * C'était juste tant qu'il n'y avait qu'un domaine. Ce n'est plus le cas : dès
 * qu'un cabinet active le sien, ses sourceurs doivent recevoir DESSUS.
 *
 * Sinon l'add-on ne tient qu'à moitié sa promesse — le candidat lit un message
 * signé du cabinet, clique « Répondre », et écrit à `naywastudio.com`. La
 * marque du client disparaît à l'endroit exact où le candidat regarde.
 *
 * ── L'adresse d'envoi et l'adresse de réception sont deux choses ──────────
 *
 *   Envoi      `careers@careers.cabinet-durand.fr`  (une par ORGANISATION)
 *   Réception  `sophie@careers.cabinet-durand.fr`   (une par SOURCEUR)
 *
 * La seconde part en `Reply-To`. C'est elle qui permet de savoir DE QUI est la
 * réponse : le domaine identifie le cabinet, la partie locale le sourceur.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database, Organization } from "../database.types"
import { canSendFromOrgDomain } from "../subscription"
import { MAIL_DOMAIN } from "../resend"

/** Champs de l'org dont dépend le domaine de réception. */
export type InboxOrg = Pick<
  Organization,
  | "trial_ends_at" | "subscription_status" | "current_period_end"
  | "subscription_has_mailing" | "mailing_status" | "mailing_sending_domain"
>

/**
 * Sur quel domaine ce sourceur doit-il recevoir ?
 *
 * Adossé à `canSendFromOrgDomain`, et pas à une règle maison : recevoir sur un
 * domaine suppose exactement ce que suppose y envoyer — l'option acquise ET la
 * zone DNS configurée. Deux gardes distinctes finiraient par diverger, et la
 * divergence serait invisible jusqu'au jour où des réponses se perdent.
 *
 * Le repli sur le domaine Naywa n'est PAS l'équivalent du repli interdit à
 * l'envoi. Un mail candidat parti sous une marque que le cabinet n'a pas
 * choisie serait une usurpation ; une boîte de réception hébergée chez Naywa
 * est simplement le service tel qu'il existe aujourd'hui.
 */
export function inboxDomainFor(org: InboxOrg | null | undefined): string {
  if (org && canSendFromOrgDomain(org) && org.mailing_sending_domain) {
    return org.mailing_sending_domain
  }
  return MAIL_DOMAIN
}

/** Transforme un nom (ou une partie locale) en partie locale d'email sûre. */
export function slugifyLocalPart(input: string): string {
  const base = input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")     // accents
    .replace(/[^a-z0-9]+/g, ".")         // tout le reste → point
    .replace(/\.+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 32)
  return base || "sourceur"
}

/** La partie locale d'une adresse, ou "" si elle n'en a pas. */
function localPartOf(address: string): string {
  const at = address.lastIndexOf("@")
  return at > 0 ? address.slice(0, at) : ""
}

/** Le domaine d'une adresse, en minuscules. */
function domainOf(address: string): string {
  const at = address.lastIndexOf("@")
  return at > 0 ? address.slice(at + 1).toLowerCase() : ""
}

/** Une autre personne utilise-t-elle déjà cette adresse, ou l'a-t-elle utilisée ? */
async function addressTaken(
  admin: SupabaseClient<Database>,
  address: string,
  exceptUserId: string,
): Promise<boolean> {
  const { data: byCurrent } = await admin
    .from("profiles")
    .select("user_id")
    .eq("inbox_address", address)
    .neq("user_id", exceptUserId)
    .limit(1)
    .maybeSingle()
  if (byCurrent) return true

  const { data: byAlias } = await admin
    .from("profiles")
    .select("user_id")
    .contains("inbox_aliases", [address])
    .neq("user_id", exceptUserId)
    .limit(1)
    .maybeSingle()
  return !!byAlias
}

/**
 * L'adresse de réception du sourceur, créée au premier usage et **remise sur
 * le bon domaine** quand celui de l'organisation change.
 *
 * ── Ce qui est conservé lors d'une bascule ────────────────────────────────
 *
 * La PARTIE LOCALE. Un sourceur qui recevait sur `sophie@` continue de
 * recevoir sur `sophie@` : elle figure dans les signatures, les échanges, la
 * tête des gens. Seul le domaine bouge.
 *
 * L'ANCIENNE ADRESSE, poussée dans `inbox_aliases`. Les candidats déjà
 * contactés répondront dessus pendant des semaines : la jeter perdrait leurs
 * réponses en silence (cf. migration 087).
 *
 * Passer le client **admin**.
 */
export async function ensureInboxAddress(
  admin: SupabaseClient<Database>,
  userId: string,
  org: InboxOrg | null | undefined,
): Promise<string> {
  const domain = inboxDomainFor(org)

  const { data: profile } = await admin
    .from("profiles")
    .select("inbox_address, inbox_aliases, first_name")
    .eq("user_id", userId)
    .single()

  const current = profile?.inbox_address ?? null
  if (current && domainOf(current) === domain.toLowerCase()) return current

  // Amorce : la partie locale actuelle si elle existe (bascule de domaine),
  // sinon le prénom, sinon l'email de connexion.
  let seed = current ? localPartOf(current) : (profile?.first_name?.trim() ?? "")
  if (!seed) {
    const { data: { user } } = await admin.auth.admin.getUserById(userId)
    seed = user?.email?.split("@")[0] ?? "sourceur"
  }
  const localBase = slugifyLocalPart(seed)

  // Collisions : local, local2, local3… Les ALIAS comptent autant que les
  // adresses courantes — réattribuer une adresse abandonnée enverrait les
  // réponses d'un ancien fil au mauvais sourceur, ce qui est pire qu'une
  // réponse perdue : c'est une fuite de données entre deux collaborateurs.
  //
  // Deux requêtes plutôt qu'un `.or()` : la syntaxe PostgREST d'un `or`
  // mêlant égalité et contenance de tableau exige un échappement que le
  // caractère « @ » d'une adresse rend fragile. Une erreur de quoting ne
  // planterait pas — elle ne trouverait simplement plus les collisions.
  let local = localBase
  let address = `${local}@${domain}`
  for (let n = 2; n < 200; n++) {
    if (!(await addressTaken(admin, address, userId))) break
    local = `${localBase}${n}`
    address = `${local}@${domain}`
  }

  const aliases = new Set(profile?.inbox_aliases ?? [])
  if (current) aliases.add(current)
  aliases.delete(address)

  await admin
    .from("profiles")
    .update({ inbox_address: address, inbox_aliases: [...aliases] })
    .eq("user_id", userId)

  return address
}

/**
 * En-tête d'affichage : `Prénom <sophie@careers.cabinet-durand.fr>`.
 *
 * Mêmes filtres que `candidateFromHeader` (cf. `send.ts`) et pour les mêmes
 * raisons : les chevrons et les sauts de ligne permettraient de refermer
 * l'en-tête pour en injecter un autre, l'arobase d'afficher une fausse adresse
 * dans le nom. Aucun prénom ne contient d'arobase.
 */
export function fromHeader(firstName: string | null | undefined, address: string): string {
  const name = (firstName ?? "")
    .replace(/["<>@\r\n]/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
  return `${name || "Naywa Studio"} <${address}>`
}
