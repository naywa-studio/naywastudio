"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { normalizeTag } from "@/lib/tags"

/**
 * Free-form custom-tag editor.
 *
 * Shows current tags as removable chips + an input to add a new one.
 * Suggests tags the sourcer has already used elsewhere (passed in via
 * `suggestions`) so the vocabulary stays consistent.
 *
 * Pure presentation — wiring to Supabase is the parent's job. The parent
 * supplies `value` (current tags) and an `onChange` that gets the full
 * next array (the parent decides when to debounce / persist).
 */
export default function TagPicker({
  value,
  onChange,
  suggestions = [],
  placeholder = "Ajouter un tag…",
  saving = false,
}: {
  value: string[]
  onChange: (next: string[]) => void
  suggestions?: string[]
  placeholder?: string
  saving?: boolean
}) {
  const [draft, setDraft] = useState("")
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  // Close the suggestion popover on outside click.
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [open])

  const matches = useMemo(() => {
    const q = draft.trim().toLowerCase()
    const taken = new Set(value.map((t) => t.toLowerCase()))
    const pool = suggestions.filter((s) => !taken.has(s.toLowerCase()))
    if (!q) return pool.slice(0, 8)
    return pool.filter((s) => s.toLowerCase().includes(q)).slice(0, 8)
  }, [draft, suggestions, value])

  const add = (raw: string) => {
    const tag = normalizeTag(raw)
    if (!tag) return
    if (value.some((t) => t.toLowerCase() === tag.toLowerCase())) {
      setDraft("")
      return
    }
    onChange([...value, tag])
    setDraft("")
    setOpen(false)
    inputRef.current?.focus()
  }

  const remove = (tag: string) => {
    onChange(value.filter((t) => t !== tag))
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && draft.trim()) {
      e.preventDefault()
      add(draft)
    } else if (e.key === "Backspace" && !draft && value.length > 0) {
      e.preventDefault()
      onChange(value.slice(0, -1))
    } else if (e.key === "Escape") {
      setOpen(false)
    }
  }

  return (
    <div ref={wrapRef} style={{ position: "relative", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{
        display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6,
        padding: "8px 10px",
        background: "#FAFAFA",
        border: "1px solid #E5E7EB", borderRadius: 10,
        minHeight: 40,
      }}>
        {value.map((t) => (
          <span key={t} style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            fontSize: 12, fontWeight: 600, color: "#4B5563",
            background: "white", border: "1px solid #E2DAF6",
            borderRadius: 100, padding: "3px 4px 3px 10px",
          }}>
            {t}
            <button
              onClick={() => remove(t)}
              title="Retirer ce tag"
              aria-label={`Retirer le tag ${t}`}
              style={{
                width: 16, height: 16, borderRadius: "50%",
                background: "transparent", border: "none",
                color: "#9CA3AF", fontSize: 12, lineHeight: 1, padding: 0,
                cursor: "pointer", fontFamily: "inherit",
                display: "inline-flex", alignItems: "center", justifyContent: "center",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "#F0ECF8"; e.currentTarget.style.color = "#7C63C8" }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#9CA3AF" }}
            >
              ×
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => { setDraft(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={value.length === 0 ? placeholder : ""}
          style={{
            flex: 1, minWidth: 120,
            background: "transparent", border: "none", outline: "none",
            fontSize: 13, color: "#111827",
            padding: "3px 2px",
          }}
        />
        {saving && (
          <span style={{ fontSize: 10.5, fontWeight: 700, color: "#7C63C8", letterSpacing: "0.04em" }}>
            ✦
          </span>
        )}
      </div>

      {open && (matches.length > 0 || draft.trim()) && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0,
          marginTop: 4, zIndex: 20,
          background: "white", borderRadius: 10,
          border: "1px solid #E2DAF6",
          boxShadow: "0 8px 24px -8px rgba(17,24,39,0.15)",
          padding: 6, maxHeight: 240, overflowY: "auto",
        }}>
          {matches.map((s) => (
            <button
              key={s}
              onClick={() => add(s)}
              style={{
                width: "100%", textAlign: "left",
                fontSize: 13, color: "#374151",
                background: "transparent", border: "none",
                padding: "7px 10px", borderRadius: 7,
                cursor: "pointer", fontFamily: "inherit",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "#F8F6FF" }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent" }}
            >
              {s}
            </button>
          ))}
          {draft.trim() && !matches.some((m) => m.toLowerCase() === draft.trim().toLowerCase()) && (
            <button
              onClick={() => add(draft)}
              style={{
                width: "100%", textAlign: "left",
                fontSize: 13, fontWeight: 600, color: "#7C63C8",
                background: "transparent", border: "none",
                padding: "7px 10px", borderRadius: 7,
                cursor: "pointer", fontFamily: "inherit",
                borderTop: matches.length > 0 ? "1px solid #F0ECF8" : "none",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(124,99,200,0.06)" }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent" }}
            >
              + Créer le tag « {draft.trim()} »
            </button>
          )}
        </div>
      )}
    </div>
  )
}
