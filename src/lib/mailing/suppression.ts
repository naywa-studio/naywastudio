/**
 * Les adresses qu'on ne recontacte plus.
 *
 * ── Ce que ça corrige ─────────────────────────────────────────────────────
 *
 * Rien n'empêchait de réécrire à une adresse qui avait rebondi définitivement.
 * Le lendemain, un collègue de la même organisation pouvait la recontacter, et
 * ainsi de suite. Pour le candidat c'est du harcèlement involontaire ; pour la
 * réputation d'envoi — PARTAGÉE entre tous les cabinets du compte SES — c'est
 * le meilleur moyen de faire suspendre tout le monde.
 *
 * ── La règle de portée ────────────────────────────────────────────────────
 *
 * Elle tient en une question : **de quoi l'événement parle-t-il ?**
 *
 *   Un rebond permanent parle de l'ADRESSE — elle n'existe pas. Aucun cabinet
 *   ne doit y écrire : suppression globale.
 *
 *   Une plainte parle du COMPTE — c'est notre taux de plaintes chez AWS qui
 *   monte, pas celui d'un cabinet. Globale également.
 *
 *   Une désinscription parle d'une RELATION — ce candidat ne veut plus être
 *   contacté par CE cabinet. La propager à tous déciderait à sa place, et
 *   ferait fuiter d'un cabinet vers un autre l'information qu'il a refusé.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "../database.types"

export type SuppressionReason = "bounce" | "complaint" | "unsubscribe" | "manual"

/**
 * Une suppression pour ce motif vaut-elle pour TOUS les cabinets ?
 *
 * Isolé et exporté pour être éprouvé : une erreur ici ne lève aucune
 * exception, elle bloque simplement trop (un cabinet privé d'un candidat
 * joignable) ou trop peu (une adresse morte recontactée indéfiniment).
 */
export function isGlobalSuppression(reason: SuppressionReason): boolean {
  return reason === "bounce" || reason === "complaint"
}

/** Minuscules et sans espaces : une adresse ne doit pas échapper au filtre
 *  pour une majuscule. La casse de la partie locale est théoriquement
 *  significative, mais aucun serveur courant ne la distingue, et ici le risque
 *  d'écrire à quelqu'un qui a refusé pèse plus lourd. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export interface SuppressionInput {
  email: string
  /** Ignoré si le motif est global. */
  organizationId?: string | null
  reason: SuppressionReason
  detail?: string | null
}

/**
 * Ajoute une adresse à la liste. Idempotent.
 *
 * Best-effort : un échec est journalisé mais ne remonte pas. Cette fonction
 * est appelée depuis le webhook d'événements, où le message est déjà en base ;
 * faire échouer le webhook provoquerait une nouvelle tentative de SNS pour
 * quelque chose qui ne s'améliorera pas.
 */
export async function suppressAddress(
  admin: SupabaseClient<Database>,
  input: SuppressionInput,
): Promise<boolean> {
  const email = normalizeEmail(input.email)
  if (!email.includes("@")) return false

  const organizationId = isGlobalSuppression(input.reason) ? null : (input.organizationId ?? null)

  const { error } = await admin.from("suppressed_addresses").upsert({
    email,
    organization_id: organizationId,
    reason: input.reason,
    detail: input.detail ?? null,
  }, { onConflict: "email,organization_id", ignoreDuplicates: true })

  if (error) {
    console.error("[suppression] ecriture impossible:", email, error.message)
    return false
  }
  return true
}

/**
 * Cette adresse est-elle interdite pour ce cabinet ?
 *
 * Renvoie le motif, ou `null`. Deux lignes possibles : la globale et celle du
 * cabinet — on prend la plus explicative des deux.
 *
 * ⚠️ **Sur erreur de lecture, on REFUSE l'envoi.** C'est l'inverse du choix
 * fait pour le plafond quotidien, et c'est délibéré : dépasser un plafond
 * interne n'a aucune conséquence extérieure, alors qu'écrire à quelqu'un qui a
 * demandé à ne plus l'être en a une — pour lui, et pour la réputation du
 * compte. Dans le doute, on n'écrit pas.
 */
export async function suppressionFor(
  admin: SupabaseClient<Database>,
  email: string,
  organizationId: string | null | undefined,
): Promise<{ blocked: boolean; reason: SuppressionReason | null; unknown?: boolean }> {
  const normalized = normalizeEmail(email)

  const { data, error } = await admin
    .from("suppressed_addresses")
    .select("reason, organization_id")
    .eq("email", normalized)

  if (error) {
    console.error("[suppression] lecture impossible:", error.message)
    return { blocked: true, reason: null, unknown: true }
  }

  const rows = (data ?? []).filter(
    (r) => r.organization_id === null || r.organization_id === organizationId,
  )
  if (rows.length === 0) return { blocked: false, reason: null }

  // Le rebond explique mieux qu'une désinscription : il dit que l'adresse
  // n'existe pas, ce que le sourceur doit savoir avant de chercher ailleurs.
  const ordered: SuppressionReason[] = ["bounce", "complaint", "unsubscribe", "manual"]
  const reason = ordered.find((r) => rows.some((row) => row.reason === r)) ?? null
  return { blocked: true, reason }
}

/** Message destiné au sourceur, en français, sans jargon. */
export function explainSuppression(reason: SuppressionReason | null): string {
  switch (reason) {
    case "bounce":
      return "Cette adresse n'existe plus : un message précédent a été définitivement refusé."
    case "complaint":
      return "Ce candidat a signalé un message précédent comme indésirable. Nous ne lui écrivons plus."
    case "unsubscribe":
      return "Ce candidat a demandé à ne plus être contacté par votre organisation."
    case "manual":
      return "Cette adresse a été mise en liste de suppression."
    default:
      return "Impossible de vérifier si ce candidat peut être contacté. Réessayez dans un instant."
  }
}
