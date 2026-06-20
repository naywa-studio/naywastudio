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
 */

import { useEffect, useState } from "react"

export interface UnreadUpdatesState {
  unreadCount: number
  latestTitle: string | null
  loading: boolean
}

const REFRESH_INTERVAL_MS = 60_000

export function useUnreadUpdates(): UnreadUpdatesState {
  const [state, setState] = useState<UnreadUpdatesState>({
    unreadCount: 0,
    latestTitle: null,
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
        }
        if (cancelled) return
        const firstUnread = j.updates.find((u) => !u.is_read)
        setState({
          unreadCount: j.unread_count,
          latestTitle: firstUnread?.title ?? null,
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
