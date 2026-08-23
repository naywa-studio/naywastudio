/**
 * Le plafond d'envoi quotidien, par organisation.
 *
 * ── Pourquoi il doit exister ─────────────────────────────────────────────
 *
 * Deux raisons, et la seconde est la plus dure.
 *
 * **La réputation SES est celle du COMPTE.** Un seul cabinet qui envoie
 * massivement fait grimper les rebonds et les plaintes pour TOUS les autres,
 * et peut faire suspendre l'ensemble. Sans plafond, un client — ou un script
 * qui déraille chez lui — emporte tous les autres avec lui.
 *
 * **On l'a écrit à AWS.** La demande d'accès production dit, mot pour mot :
 * « We enforce a per-customer daily sending cap in our application. »
 * Le seul plafond existant était `DAILY_LIMITS.send = 10 000` par
 * utilisateur — autrement dit aucun. Une affirmation qu'on ne tenait pas.
 *
 * ── Pourquoi par ORGANISATION et pas par utilisateur ─────────────────────
 *
 * Parce que c'est l'unité que SES mesure et que nous facturons. Un plafond
 * par utilisateur se contourne en ajoutant des sièges, et ne dit rien de ce
 * qui sort réellement au nom d'un cabinet.
 *
 * ── Pourquoi compter les messages plutôt qu'un compteur ──────────────────
 *
 * `email_messages` porte déjà la vérité : un envoi réussi = une ligne. Un
 * compteur séparé se désynchronise (échec après incrément, reset raté), et
 * un plafond qui se trompe est pire qu'un plafond absent — il bloque des
 * envois légitimes sans qu'on comprenne pourquoi.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "../database.types"

/**
 * Envois quotidiens autorisés par siège.
 *
 * Calé sur ce qu'on a décrit à AWS — « 10 à 30 messages par jour ouvré et par
 * recruteur » — avec de la marge pour une journée dense. Au-delà, ce n'est
 * plus du sourcing individuel : c'est de la diffusion, et ce n'est pas ce que
 * ce produit fait.
 */
export const DAILY_SENDS_PER_SEAT = 60

/** Plancher : une organisation à un siège garde une marge de travail réelle. */
export const DAILY_SENDS_MINIMUM = 60

export interface SendCapVerdict {
  ok: boolean
  sent: number
  limit: number
  /** Message destiné au sourceur, en français, sans jargon. */
  message?: string
}

/** Le plafond du jour pour une organisation, selon ses sièges. */
export function dailySendLimit(seats: number | null | undefined): number {
  const n = Math.max(1, Math.floor(seats ?? 1))
  return Math.max(DAILY_SENDS_MINIMUM, n * DAILY_SENDS_PER_SEAT)
}

/**
 * Reste-t-il de la marge aujourd'hui ?
 *
 * Ne consomme rien : on compte ce qui est DÉJÀ parti. Un envoi qui échoue
 * n'est donc jamais décompté, ce qui évite qu'une panne du fournisseur mange
 * le quota d'un client qui n'a rien envoyé.
 *
 * En cas d'erreur de lecture, on LAISSE PASSER. Un plafond est un garde-fou
 * de réputation, pas un contrôle d'accès : bloquer tous les envois d'un
 * cabinet parce qu'une requête a échoué ferait plus de dégâts que le risque
 * qu'il couvre.
 */
export async function checkOrgDailySendCap(
  admin: SupabaseClient<Database>,
  organizationId: string,
  seats: number | null | undefined,
): Promise<SendCapVerdict> {
  const limit = dailySendLimit(seats)
  const since = new Date()
  since.setUTCHours(0, 0, 0, 0)

  const { count, error } = await admin
    .from("email_messages")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("direction", "outbound")
    .eq("status", "sent")
    .gte("created_at", since.toISOString())

  if (error) {
    console.error("[send-cap] lecture impossible, envoi autorisé par défaut:", error.message)
    return { ok: true, sent: 0, limit }
  }

  const sent = count ?? 0
  if (sent < limit) return { ok: true, sent, limit }

  return {
    ok: false,
    sent,
    limit,
    message:
      `Vous avez atteint la limite de ${limit} messages pour aujourd'hui. ` +
      `Elle protège la délivrabilité de votre domaine — un volume soudain est ` +
      `le premier signal qui fait classer un expéditeur en indésirable. ` +
      `Reprenez demain, ou contactez-nous si votre activité le justifie.`,
  }
}
