"use client"

/**
 * Les réponses des candidats, partagées par tous les composants qui les
 * affichent : la section de l'accueil et la pastille de navigation.
 *
 * ── Pourquoi un store au niveau module, et pas un `useState` par composant ─
 *
 * Ce n'est pas un raffinement : c'est une régression déjà vécue dans ce
 * projet. `useUnreadUpdates` lançait un `setInterval` par instance ; comme la
 * pastille est montée une fois par entrée de menu, une page ouverte tenait une
 * dizaine de sondages indépendants — le premier poste de consommation Fluid
 * CPU sur Vercel. Le même piège est tendu ici, puisque deux composants au
 * moins veulent la même donnée. Un seul appel, un seul minuteur, quel que soit
 * le nombre d'abonnés.
 *
 * Le minuteur se met en pause quand l'onglet n'est pas visible : un sourceur
 * laisse Naywa ouvert toute la journée dans un onglet de fond.
 */

import { useSyncExternalStore } from "react"

export interface CandidateReply {
  id: string
  candidateId: string | null
  candidateName: string | null
  jobId: string | null
  jobTitle: string | null
  /** La fiche match : là où vivent le fil et la zone de réponse. */
  matchId: string | null
  subject: string | null
  excerpt: string
  sentiment: "interested" | "not_interested" | "question" | "neutral" | "negotiation" | null
  summary: string | null
  handledAt: string | null
  /** Prénom du membre qui s'en charge, `null` si personne. */
  handledBy: string | null
  at: string
}

export interface RepliesState {
  enabled: boolean
  replies: CandidateReply[]
  /** Réponses que personne n'a encore prises en charge — la pastille. */
  pending: number
  loading: boolean
}

const REFRESH_INTERVAL_MS = 3 * 60_000
const STALE_MS = 20_000

const INITIAL: RepliesState = { enabled: false, replies: [], pending: 0, loading: true }

let snapshot: RepliesState = INITIAL
let lastFetchedAt = 0
let inFlight: Promise<void> | null = null
let timer: number | null = null
const subscribers = new Set<() => void>()

function emit(next: RepliesState) {
  snapshot = next
  subscribers.forEach((fn) => fn())
}

function fetchReplies(): Promise<void> {
  if (inFlight) return inFlight
  inFlight = (async () => {
    try {
      const res = await fetch("/api/mailing/replies", { cache: "no-store" })
      if (!res.ok) return
      const j = await res.json()
      emit({
        enabled: j.enabled === true,
        replies: (j.replies ?? []) as CandidateReply[],
        pending: j.pending ?? 0,
        loading: false,
      })
      lastFetchedAt = Date.now()
    } catch {
      // Ne créer une nouvelle référence que si l'état change réellement :
      // sinon chaque échec réseau re-rendrait tous les abonnés pour rien.
      if (snapshot.loading) emit({ ...snapshot, loading: false })
    } finally {
      inFlight = null
    }
  })()
  return inFlight
}

const isStale = () => Date.now() - lastFetchedAt > STALE_MS

function onVisibilityChange() {
  if (document.visibilityState === "visible" && isStale()) void fetchReplies()
}

function subscribe(onStoreChange: () => void): () => void {
  const isFirst = subscribers.size === 0
  subscribers.add(onStoreChange)
  if (isStale()) void fetchReplies()

  if (isFirst) {
    timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return
      void fetchReplies()
    }, REFRESH_INTERVAL_MS)
    document.addEventListener("visibilitychange", onVisibilityChange)
  }

  return () => {
    subscribers.delete(onStoreChange)
    if (subscribers.size === 0) {
      if (timer !== null) { window.clearInterval(timer); timer = null }
      document.removeEventListener("visibilitychange", onVisibilityChange)
    }
  }
}

const getSnapshot = () => snapshot
const getServerSnapshot = () => INITIAL

export function useCandidateReplies(): RepliesState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

/**
 * « Je m'en occupe » — ou l'inverse.
 *
 * L'état local bascule AVANT la réponse du serveur : le geste est anodin et
 * réversible, et attendre le réseau pour cocher une case donne l'impression
 * d'un produit qui traîne. En cas d'échec on recharge, ce qui remet la vérité
 * du serveur sans avoir à raisonner sur un état intermédiaire.
 */
export async function markReplyHandled(id: string, handled: boolean): Promise<void> {
  const now = new Date().toISOString()
  emit({
    ...snapshot,
    replies: snapshot.replies.map((r) => (r.id === id ? { ...r, handledAt: handled ? now : null } : r)),
    pending: Math.max(0, snapshot.pending + (handled ? -1 : 1)),
  })
  try {
    const res = await fetch("/api/mailing/replies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, handled }),
    })
    if (!res.ok) throw new Error("failed")
    // Recharge en fond : `handledBy` (le prénom) vient du serveur, et deux
    // sourceurs peuvent avoir agi en même temps.
    lastFetchedAt = 0
    void fetchReplies()
  } catch {
    lastFetchedAt = 0
    void fetchReplies()
  }
}
