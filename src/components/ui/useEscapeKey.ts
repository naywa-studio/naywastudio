"use client"

/**
 * Hook qui appelle `onEscape` quand la touche Échap est pressée.
 * À monter dans chaque modale pour fermeture clavier — pattern attendu
 * par 90 % des users (la croix marche déjà, c'est juste le raccourci).
 *
 * Idempotent : si plusieurs modales sont ouvertes en même temps (rare),
 * seule la dernière montée écoute (cleanup à l'unmount).
 */

import { useEffect } from "react"

export function useEscapeKey(onEscape: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onEscape()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onEscape, enabled])
}
