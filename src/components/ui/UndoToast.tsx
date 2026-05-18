"use client"

import { useEffect, useRef, useState } from "react"
import { m, AnimatePresence } from "framer-motion"

/**
 * Undoable-action toast.
 *
 * Pattern: caller hides the item locally and schedules the real mutation
 * (delete, archive, etc.) to run after a delay. While the toast is up,
 * the user can click "Annuler" — the toast resolves with `cancelled: true`,
 * the caller restores the local state and skips the mutation.
 *
 * Usage:
 *
 *   const undo = useUndoToast()
 *   // user clicks delete:
 *   removeLocally(item)
 *   const { cancelled } = await undo.show("Candidat supprimé")
 *   if (cancelled) restoreLocally(item)
 *   else await fetch(`/api/.../${item.id}`, { method: "DELETE" })
 */

interface PendingToast {
  id: number
  label: string
  resolve: (result: { cancelled: boolean }) => void
  deadline: number
}

let _showImpl: ((label: string, ms?: number) => Promise<{ cancelled: boolean }>) | null = null

/** Imperative API — call from anywhere once <UndoToastHost /> is mounted. */
export function showUndoToast(label: string, ms = 5000): Promise<{ cancelled: boolean }> {
  if (!_showImpl) {
    // No host mounted (server render, or initial paint) — resolve as if
    // confirmed so the caller's mutation still runs.
    return Promise.resolve({ cancelled: false })
  }
  return _showImpl(label, ms)
}

/** Mount once at the layout level. */
export default function UndoToastHost() {
  const [toasts, setToasts] = useState<PendingToast[]>([])
  const idRef = useRef(0)

  useEffect(() => {
    _showImpl = (label: string, ms = 5000) => new Promise<{ cancelled: boolean }>((resolve) => {
      const id = ++idRef.current
      const t: PendingToast = { id, label, resolve, deadline: Date.now() + ms }
      setToasts((prev) => [...prev, t])
      setTimeout(() => {
        // If still present, auto-resolve as confirmed.
        setToasts((prev) => {
          const found = prev.find((p) => p.id === id)
          if (found) found.resolve({ cancelled: false })
          return prev.filter((p) => p.id !== id)
        })
      }, ms)
    })
    return () => { _showImpl = null }
  }, [])

  const cancel = (id: number) => {
    setToasts((prev) => {
      const found = prev.find((p) => p.id === id)
      if (found) found.resolve({ cancelled: true })
      return prev.filter((p) => p.id !== id)
    })
  }

  return (
    <div
      aria-live="polite"
      style={{
        position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
        zIndex: 100, display: "flex", flexDirection: "column-reverse", gap: 8,
        pointerEvents: "none",
      }}
    >
      <AnimatePresence>
        {toasts.map((t) => (
          <m.div
            key={t.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.22 }}
            style={{
              pointerEvents: "auto",
              background: "#1F1A36", color: "white",
              borderRadius: 14, padding: "11px 14px",
              display: "flex", alignItems: "center", gap: 12,
              boxShadow: "0 14px 36px -10px rgba(17,24,39,0.45)",
              fontSize: 13.5,
              minWidth: 280,
            }}
          >
            <span style={{ flex: 1 }}>{t.label}</span>
            <button
              onClick={() => cancel(t.id)}
              style={{
                background: "rgba(255,255,255,0.12)",
                color: "white", border: "none",
                borderRadius: 8, padding: "5px 12px",
                fontSize: 12.5, fontWeight: 700,
                cursor: "pointer", fontFamily: "inherit",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.22)" }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.12)" }}
            >
              Annuler
            </button>
          </m.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
