"use client"

/**
 * Hook qui poll /api/updates pour récupérer le nombre de nouveautés
 * non-lues par l'utilisateur courant. Utilisé pour la pastille
 * violette dans la sidebar workspace + organisation et pour la card
 * "Nouveautés" sous le hero.
 *
 * Léger : un seul fetch au mount + refetch toutes les 60s pour
 * récupérer les nouvelles publications éventuelles sans recharger
 * la page. Cache-Control: no-store côté API.
 *
 * En plus du compteur global, on remonte `unreadPaths` : la liste
 * des paths concernés par au moins une nouveauté non-lue (cf.
 * lib/affected-paths.ts). Le composant <NavUnreadDot href={...} />
 * l'utilise pour afficher une pastille violette sur chaque item de
 * menu sidebar concerné.
 */

import { useEffect, useState } from "react"

export interface UnreadUpdatesState {
  unreadCount: number
  latestTitle: string | null
  /** Set des paths concernés par au moins une update non-lue
   *  (ex: "/workspace/vivier"). On utilise un Set pour O(1) lookup
   *  côté <NavUnreadDot />. */
  unreadPaths: Set<string>
  loading: boolean
}

const REFRESH_INTERVAL_MS = 60_000
const EMPTY_PATHS: Set<string> = new Set()

export function useUnreadUpdates(): UnreadUpdatesState {
  const [state, setState] = useState<UnreadUpdatesState>({
    unreadCount: 0,
    latestTitle: null,
    unreadPaths: EMPTY_PATHS,
    loading: true,
  })

  useEffect(() => {
    let cancelled = false
    const fetchUnread = async () => {
      try {
        const res = await fetch("/api/updates", { cache: "no-store" })
        if (!res.ok) return
        const j = await res.json() as {
          updates: Array<{ id: string; title: string; is_read: boolean }>
          unread_count: number
          unread_paths?: string[]
        }
        if (cancelled) return
        const firstUnread = j.updates.find((u) => !u.is_read)
        setState({
          unreadCount: j.unread_count,
          latestTitle: firstUnread?.title ?? null,
          unreadPaths: new Set(j.unread_paths ?? []),
          loading: false,
        })
      } catch {
        if (!cancelled) setState((s) => ({ ...s, loading: false }))
      }
    }
    void fetchUnread()
    const t = window.setInterval(fetchUnread, REFRESH_INTERVAL_MS)
    return () => { cancelled = true; window.clearInterval(t) }
  }, [])

  return state
}
