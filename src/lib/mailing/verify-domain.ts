/**
 * Vérifier un domaine, et en tirer toutes les conséquences.
 *
 * ── Pourquoi c'est une fonction et non du code de route ──────────────────
 *
 * Deux chemins mènent ici : le sourceur connecté, et le contact technique à
 * qui il a délégué la publication DNS — qui, lui, n'a pas de compte.
 *
 * Ces deux chemins doivent produire EXACTEMENT le même effet. Si seul le
 * chemin authentifié basculait les adresses de réception, un domaine vérifié
 * par le prestataire serait actif pour l'envoi mais pas pour la réception :
 * les candidats répondraient dans le vide, et personne ne verrait d'erreur.
 *
 * C'est le genre d'écart qu'on ne découvre qu'en production, chez le premier
 * client qui a délégué — c'est-à-dire chez le moins technique.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database, Organization } from "../database.types"
import { activeProvider } from "./send"
import { switchOrgInboxAddresses } from "./inbox-address"
import { checkRecords, detectDnsHost, type RecordCheck, type DnsHost } from "./dns-check"
import type { MailingDnsRecord } from "./provider"

export interface VerifyOutcome {
  status: string
  records: MailingDnsRecord[]
  /** État ligne par ligne, vide quand le domaine est déjà actif. */
  checks: RecordCheck[]
  host: DnsHost | null
  becameActive: boolean
  addressesSwitched: number
}

/**
 * Relit l'état chez le fournisseur, persiste, et bascule les adresses si le
 * domaine vient de devenir actif.
 *
 * Jette si le fournisseur est injoignable — l'appelant décide quoi en dire.
 */
export async function verifyAndPersist(
  admin: SupabaseClient<Database>,
  org: Organization,
  opts?: { isAdmin?: boolean },
): Promise<VerifyOutcome> {
  if (!org.mailing_sending_domain) throw new Error("no_domain")

  const state = await activeProvider().verifySendingDomain(org.mailing_sending_domain)
  const becameActive = state.status === "active" && org.mailing_status !== "active"

  const { error } = await admin.from("organizations").update({
    mailing_status: state.status,
    mailing_dns_records: state.records,
    mailing_verified_at: state.status === "active"
      ? (org.mailing_verified_at ?? new Date().toISOString())
      : null,
  }).eq("id", org.id)
  if (error) throw new Error(`store_failed: ${error.message}`)

  // Best-effort : un échec ici ne doit pas annuler une vérification RÉUSSIE.
  // Le domaine est authentifié, c'est le fait important ; une adresse non
  // basculée le sera au premier envoi. L'inverse ferait perdre au client une
  // étape DNS qu'il vient de franchir.
  const addressesSwitched = becameActive
    ? await switchOrgInboxAddresses(admin, { ...org, mailing_status: state.status }, opts)
    : 0

  // Le détail ligne par ligne ne sert que tant que ce n'est pas fini.
  const checks = state.status === "active" ? [] : await checkRecords(state.records)
  const host = state.status === "active" || !org.mailing_domain
    ? null
    : await detectDnsHost(org.mailing_domain)

  return { status: state.status, records: state.records, checks, host, becameActive, addressesSwitched }
}

/**
 * Durée de validité d'un lien de délégation.
 *
 * Assez long pour qu'un prestataire informatique traite la demande à son
 * rythme — une semaine de délai n'a rien d'anormal —, assez court pour qu'un
 * lien oublié dans une boîte mail ne reste pas ouvert indéfiniment.
 */
export const DELEGATE_LINK_DAYS = 14

/** Le lien est-il encore valable ? */
export function delegateLinkExpired(sentAt: string | null | undefined): boolean {
  if (!sentAt) return true
  const ms = Date.now() - new Date(sentAt).getTime()
  return ms > DELEGATE_LINK_DAYS * 24 * 60 * 60 * 1000
}
