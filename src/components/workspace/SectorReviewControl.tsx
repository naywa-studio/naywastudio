"use client"

/**
 * SectorReviewControl — revue / correction du secteur d'un candidat.
 *
 * Bouton compact (secteurs posés) qui ouvre un panneau de cases à cocher.
 * Le panneau est rendu via `createPortal` vers `document.body` en position
 * fixe → il ne peut jamais passer derrière une carte voisine (le grid crée
 * des contextes d'empilement à cause des transforms de hover).
 *
 * `showStatus` (défaut false) affiche la pastille Nora / À classer / Validé —
 * utile à la revue d'import, masquée sur les cartes du vivier (peu parlante).
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import type { SectorStatus } from "@/lib/database.types"

const CAP = 20 // pas de vraie limite produit ; garde-fou anti-abus.

const STATUS_META: Record<SectorStatus, { label: string; color: string; bg: string; border: string }> = {
  auto:      { label: "Nora",      color: "#7C63C8", bg: "rgba(124,99,200,0.10)", border: "rgba(124,99,200,0.28)" },
  to_review: { label: "À classer", color: "#B45309", bg: "rgba(245,158,11,0.10)", border: "rgba(245,158,11,0.30)" },
  validated: { label: "Validé",    color: "#15803D", bg: "rgba(34,197,94,0.10)",  border: "rgba(34,197,94,0.30)" },
}

export function SectorStatusBadge({ status }: { status: SectorStatus }) {
  const m = STATUS_META[status] ?? STATUS_META.to_review
  return (
    <span style={{
      fontSize: 9.5, fontWeight: 700, color: m.color,
      background: m.bg, border: `1px solid ${m.border}`,
      borderRadius: 999, padding: "1px 7px",
      letterSpacing: "0.04em", textTransform: "uppercase", whiteSpace: "nowrap",
    }}>
      {m.label}
    </span>
  )
}

export function SectorReviewControl({
  candidateId,
  sectors,
  status,
  allSectors,
  onChange,
  onSectorCreated,
  disabled = false,
  showStatus = false,
}: {
  candidateId: string
  sectors: string[]
  status: SectorStatus
  /** Noms de secteurs connus de l'org, pour la liste déroulante. */
  allSectors: string[]
  /** Remonte la nouvelle valeur (statut passe à "validated" côté serveur). */
  onChange: (sectors: string[], status: SectorStatus) => void
  /** Quand un secteur inédit est créé, pour l'ajouter à `allSectors` du parent. */
  onSectorCreated?: (name: string) => void
  disabled?: boolean
  /** Affiche la pastille de statut (Nora / À classer / Validé). Défaut : non. */
  showStatus?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<string[]>(sectors)
  const [newName, setNewName] = useState("")
  const [saving, setSaving] = useState(false)
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const PANEL_W = 240

  // Resync le brouillon quand la valeur externe change (ex : Nora reclasse).
  useEffect(() => { setDraft(sectors) }, [sectors])

  // Positionne le panneau sous le bouton (coordonnées viewport, position fixed).
  const place = () => {
    const r = btnRef.current?.getBoundingClientRect()
    if (!r) return
    const left = Math.max(8, Math.min(r.right - PANEL_W, window.innerWidth - PANEL_W - 8))
    setCoords({ top: r.bottom + 6, left })
  }
  useLayoutEffect(() => {
    if (!open) return
    place()
    const onScroll = () => setOpen(false)
    window.addEventListener("scroll", onScroll, true)
    window.addEventListener("resize", onScroll)
    return () => {
      window.removeEventListener("scroll", onScroll, true)
      window.removeEventListener("resize", onScroll)
    }
  }, [open])

  // Ferme au clic extérieur + Échap.
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node
      if (btnRef.current?.contains(t) || panelRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false) }
    document.addEventListener("mousedown", onDoc)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDoc)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  const toggle = (name: string) => {
    setDraft((prev) => prev.includes(name) ? prev.filter((s) => s !== name) : [...prev, name].slice(0, CAP))
  }

  const addNew = () => {
    const n = newName.trim()
    if (!n || draft.some((s) => s.toLowerCase() === n.toLowerCase())) { setNewName(""); return }
    setDraft((prev) => [...prev, n].slice(0, CAP))
    onSectorCreated?.(n)
    setNewName("")
  }

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/candidates/${candidateId}/sectors`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectors: draft, status: "validated" }),
      })
      const data = await res.json().catch(() => null) as
        { candidate?: { sectors?: string[]; sector_status?: SectorStatus } } | null
      const nextSectors = data?.candidate?.sectors ?? draft
      const nextStatus = data?.candidate?.sector_status ?? "validated"
      onChange(nextSectors, nextStatus)
      setOpen(false)
    } finally {
      setSaving(false)
    }
  }

  const options = Array.from(new Set([...allSectors, ...draft]))
    .sort((a, b) => a.localeCompare(b, "fr"))

  const panel = open && coords ? createPortal(
    <div
      ref={panelRef}
      style={{
        position: "fixed", top: coords.top, left: coords.left, zIndex: 200,
        width: PANEL_W, background: "white", borderRadius: 10,
        border: "1px solid #EBE6F6",
        boxShadow: "0 14px 40px -14px rgba(17,24,39,0.28)",
        padding: 10, fontFamily: "var(--font-inter), sans-serif",
      }}
    >
      <p style={{ margin: "0 0 8px", fontSize: 10.5, fontWeight: 700, color: "#9CA3AF", letterSpacing: "0.04em", textTransform: "uppercase" }}>
        Secteurs
      </p>
      <div style={{ maxHeight: 168, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
        {options.length === 0 && (
          <p style={{ margin: "4px 2px", fontSize: 11.5, color: "#9CA3AF" }}>
            Aucun secteur. Créez-en un ci-dessous.
          </p>
        )}
        {options.map((name) => {
          const checked = draft.includes(name)
          return (
            <button
              key={name}
              type="button"
              onClick={() => toggle(name)}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "6px 8px", borderRadius: 7,
                background: checked ? "rgba(124,99,200,0.07)" : "transparent",
                border: "none", cursor: "pointer", textAlign: "left", width: "100%",
                fontFamily: "inherit",
              }}
            >
              <span style={{
                width: 15, height: 15, borderRadius: 4, flexShrink: 0,
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                background: checked ? "#7C63C8" : "white",
                border: `1.5px solid ${checked ? "#7C63C8" : "#D1D5DB"}`,
              }}>
                {checked && (
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                )}
              </span>
              <span style={{ fontSize: 12.5, color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {name}
              </span>
            </button>
          )
        })}
      </div>

      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addNew() } }}
          placeholder="Nouveau secteur…"
          style={{
            flex: 1, minWidth: 0, fontSize: 12, color: "#111827",
            padding: "6px 8px", border: "1px solid #E5E7EB", borderRadius: 7,
            outline: "none", fontFamily: "inherit",
          }}
        />
        <button
          type="button"
          onClick={addNew}
          disabled={!newName.trim()}
          style={{
            fontSize: 12, fontWeight: 700,
            color: newName.trim() ? "#7C63C8" : "#C4C4C4",
            background: "white", border: "1px solid #E5E7EB", borderRadius: 7,
            padding: "0 10px", cursor: newName.trim() ? "pointer" : "default",
            fontFamily: "inherit",
          }}
        >
          +
        </button>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 10 }}>
        <button
          type="button"
          onClick={() => { setDraft(sectors); setOpen(false) }}
          style={{
            fontSize: 12, fontWeight: 600, color: "#6B7280",
            background: "white", border: "1px solid #E5E7EB", borderRadius: 7,
            padding: "6px 11px", cursor: "pointer", fontFamily: "inherit",
          }}
        >
          Annuler
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          style={{
            fontSize: 12, fontWeight: 700, color: "white",
            background: saving ? "#C4B6E0" : "#7C63C8",
            border: "none", borderRadius: 7, padding: "6px 13px",
            cursor: saving ? "default" : "pointer", fontFamily: "inherit",
          }}
        >
          {saving ? "…" : "Valider"}
        </button>
      </div>
    </div>,
    document.body,
  ) : null

  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      {showStatus && <SectorStatusBadge status={status} />}
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        title="Modifier le secteur"
        style={{
          height: 28, boxSizing: "border-box",
          display: "inline-flex", alignItems: "center", gap: 5,
          maxWidth: 190, overflow: "hidden",
          fontSize: 11, fontWeight: 600, color: sectors.length ? "#4B5563" : "#9CA3AF",
          background: "white", border: "1px solid #E5E7EB",
          borderRadius: 7, padding: "0 8px",
          cursor: disabled ? "default" : "pointer", fontFamily: "inherit",
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {sectors.length ? sectors.join(", ") : "Choisir…"}
        </span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }} aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {panel}
    </div>
  )
}
