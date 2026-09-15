/**
 * Fermeture d'une mission : la seule définition de « fermée » du produit.
 *
 * Demande GMH (sept. 2026) : pouvoir FERMER une mission terminée sans la
 * supprimer. Une mission fermée disparaît de /workspace/missions et de la
 * pipeline, reste consultable dans une section repliée, et se réouvre à
 * l'identique (candidats, shortlist, retours client, étapes conservés).
 *
 * Pas de nouvelle colonne : `jobs.status` accepte déjà 'archived' (contrainte
 * CHECK `jobs_status_check`) et PATCH /api/jobs/:id l'autorise. Fermer écrit
 * 'archived', réouvrir écrit 'open'.
 *
 * 'filled' (pourvue) est aussi traitée comme fermée : aucun écran ne l'écrit
 * aujourd'hui, mais l'API l'accepte, et une mission pourvue n'a rien à faire
 * dans la liste des missions en cours. Toute lecture passe par
 * `isMissionClosed` pour que les deux valeurs ne divergent jamais d'un écran
 * à l'autre.
 */

import type { Job } from "@/lib/database.types"

/** Statut écrit à la fermeture. */
export const CLOSED_MISSION_STATUS: Job["status"] = "archived"
/** Statut écrit à la réouverture. */
export const OPEN_MISSION_STATUS: Job["status"] = "open"
/** Tous les statuts lus comme « fermée ». Les requêtes SQL qui excluent les
 *  missions fermées doivent partir de cette liste, pas d'une copie. */
export const CLOSED_MISSION_STATUSES: readonly Job["status"][] = ["archived", "filled"]

export function isMissionClosed(status: string | null | undefined): boolean {
  return (CLOSED_MISSION_STATUSES as readonly string[]).includes(status ?? "")
}

/**
 * Ferme (open = false) ou réouvre (open = true) une mission.
 * Renvoie la mission à jour, ou null si le serveur a refusé (lecture seule,
 * réseau) : l'appelant garde alors l'état affiché et le signale.
 */
export async function setMissionOpen(jobId: string, open: boolean): Promise<Job | null> {
  try {
    const res = await fetch(`/api/jobs/${jobId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: open ? OPEN_MISSION_STATUS : CLOSED_MISSION_STATUS }),
    })
    if (!res.ok) return null
    const data = (await res.json().catch(() => null)) as { job?: Job } | null
    return data?.job ?? null
  } catch {
    return null
  }
}

/** Suppression définitive : matchs et shortlist partent en cascade, les CV
 *  restent dans le vivier. */
export async function deleteMission(jobId: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/jobs/${jobId}`, { method: "DELETE" })
    return res.ok
  } catch {
    return false
  }
}
