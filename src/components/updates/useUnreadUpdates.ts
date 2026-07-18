"use client"

/**
 * Hook qui expose le nombre de nouveautés non-lues par l'utilisateur courant.
 * Utilisé par la pastille violette de la sidebar (workspace + organisation),
 * par <NavUnreadDot /> sur CHAQUE item de menu, et par la card "Nouveautés"
 * sous le hero.
 *
 * ⚠️ Pourquoi un store partagé au niveau module ?
 * Avant, chaque instance du hook lançait SON propre `setInterval` de 60 s.
 * Comme <NavUnreadDot /> est monté une fois par item de nav, une page
 * workspace ouverte lançait ~10 pollers indépendants → ~600 appels/heure à
 * /api/updates, même onglet en arrière-plan. C'était le premier poste de
 * consommation Fluid Active CPU sur Vercel.
 *
 * Maintenant : UN seul fetch et UN seul timer pour toute la page, quel que
 * soit le nombre de composants abonnés.
 *   - dédoublonnage des requêtes en vol (les ~10 montages simultanés d'une
 *     navigation ne déclenchent qu'UN appel) ;
 *   - rafraîchissement de fond toutes les 5 min au lieu de 60 s ;
 *   - timer mis en pause quand l'onglet est masqué, et refetch au retour si
 *     les données sont périmées ;
 *   - refetch au montage seulement si le cache a plus de STALE_MS — ce qui
 *     garde la pastille réactive à la navigation (ex : retour de /nouveautes
 *     après un mark-read) sans repasser à du polling serré.
 *
 * L'API publique du hook est inchangée : les composants consommateurs n'ont
 * pas bougé d'une ligne.
 */

import { useSyncExternalStore } from "react"

export interface UnreadUpdatesState {
  unreadCount: number
  latestTitle: string | null
  /** Set des paths concernés par au moins une update non-lue
   *  (ex: "/workspace/vivier"). On utilise un Set pour O(1) lookup
   *  côté <NavUnreadDot />. */
  unreadPaths: Set<string>
  loading: boolean
}

/** Rafraîchissement de fond, onglet visible uniquement. */
const REFRESH_INTERVAL_MS = 5 * 60_000
/** En-deçà, on considère le cache encore frais (pas de refetch au montage). */
const STALE_MS = 30_000

const EMPTY_PATHS: Set<string> = new Set()

// ── Store partagé ────────────────────────────────────────────────────
/** Snapshot initial — référence STABLE (exigée par useSyncExternalStore,
 *  y compris pour le rendu serveur). */
const INITIAL: UnreadUpdatesState = {
  unreadCount: 0,
  latestTitle: null,
  unreadPaths: EMPTY_PATHS,
  loading: true,
}

let snapshot: UnreadUpdatesState = INITIAL
let lastFetchedAt = 0
let inFlight: Promise<void> | null = null
let timer: number | null = null
const subscribers = new Set<() => void>()

function emit(next: UnreadUpdatesState) {
  snapshot = next
  subscribers.forEach((fn) => fn())
}

/** Un seul appel réseau à la fois : les montages simultanés se greffent
 *  sur la promesse en cours au lieu d'ouvrir N requêtes. */
function fetchUnread(): Promise<void> {
  if (inFlight) return inFlight

  inFlight = (async () => {
    try {
      const res = await fetch("/api/updates", { cache: "no-store" })
      if (!res.ok) return
      const j = (await res.json()) as {
        updates: Array<{ id: string; title: string; is_read: boolean }>
        unread_count: number
        unread_paths?: string[]
      }
      const firstUnread = j.updates.find((u) => !u.is_read)
      emit({
        unreadCount: j.unread_count,
        latestTitle: firstUnread?.title ?? null,
        unreadPaths: new Set(j.unread_paths ?? []),
        loading: false,
      })
      lastFetchedAt = Date.now()
    } catch {
      // On sort juste de l'état "loading" — sans créer une nouvelle
      // référence si c'est déjà fait, pour ne pas re-rendre inutilement
      // les ~10 abonnés à chaque échec réseau.
      if (snapshot.loading) emit({ ...snapshot, loading: false })
    } finally {
      inFlight = null
    }
  })()

  return inFlight
}

function isStale() {
  return Date.now() - lastFetchedAt > STALE_MS
}

function startTimer() {
  if (timer !== null) return
  timer = window.setInterval(() => {
    // Onglet masqué : on ne consomme rien. Le retour au premier plan
    // déclenchera un refetch si nécessaire.
    if (document.visibilityState !== "visible") return
    void fetchUnread()
  }, REFRESH_INTERVAL_MS)
}

function stopTimer() {
  if (timer === null) return
  window.clearInterval(timer)
  timer = null
}

function onVisibilityChange() {
  if (document.visibilityState === "visible" && isStale()) void fetchUnread()
}

/** Abonnement au store partagé. C'est ici que vivent les effets de bord :
 *  démarrage/arrêt du timer et du listener de visibilité, pilotés par le
 *  premier et le dernier abonné. */
function subscribe(onStoreChange: () => void): () => void {
  const isFirst = subscribers.size === 0
  subscribers.add(onStoreChange)

  // Rafraîchit à la navigation si le cache est périmé (dédoublonné : les
  // ~10 montages simultanés d'une page ne déclenchent qu'un seul appel).
  if (isStale()) void fetchUnread()

  if (isFirst) {
    startTimer()
    document.addEventListener("visibilitychange", onVisibilityChange)
  }

  return () => {
    subscribers.delete(onStoreChange)
    if (subscribers.size === 0) {
      stopTimer()
      document.removeEventListener("visibilitychange", onVisibilityChange)
    }
  }
}

const getSnapshot = () => snapshot
const getServerSnapshot = () => INITIAL

export function useUnreadUpdates(): UnreadUpdatesState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
