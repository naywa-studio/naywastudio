"use client"

/**
 * DatePicker — remplace <input type="date"> pour ne plus dépendre du
 * formatage natif du navigateur (qui suit la langue/OS de l'utilisateur,
 * pas la langue choisie dans l'app — d'où le "jj/mm/aaaa" qui restait
 * affiché même en anglais). Rendu 100% custom, même valeur ISO
 * (yyyy-mm-dd) en entrée/sortie que le natif pour rester compatible avec
 * le reste du code (API, validation).
 */

import { useEffect, useMemo, useRef, useState } from "react"
import { useLanguage } from "@/lib/i18n/LanguageContext"

const copy = {
  fr: {
    placeholder: "jj/mm/aaaa",
    today: "Aujourd'hui",
    clear: "Effacer",
    prevMonth: "Mois précédent",
    nextMonth: "Mois suivant",
  },
  en: {
    placeholder: "dd/mm/yyyy",
    today: "Today",
    clear: "Clear",
    prevMonth: "Previous month",
    nextMonth: "Next month",
  },
}

function pad2(n: number): string {
  return String(n).padStart(2, "0")
}

function toIso(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function fromIso(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(d.getTime()) ? null : d
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

export default function DatePicker({
  value, onChange, style, borderColor, disabled = false,
}: {
  /** ISO yyyy-mm-dd, ou "" si vide — même contrat que <input type="date">. */
  value: string
  onChange: (next: string) => void
  /** Style du wrapper (positionnement, largeur…). */
  style?: React.CSSProperties
  /** Couleur de bordure du champ (statut required/ok/optional). */
  borderColor?: string
  disabled?: boolean
}) {
  const { lang } = useLanguage()
  const t = copy[lang]
  const locale = lang === "fr" ? "fr-FR" : "en-GB"

  const selected = useMemo(() => fromIso(value), [value])
  const [open, setOpen] = useState(false)
  const [cursor, setCursor] = useState<Date>(() => selected ?? new Date())
  const wrapRef = useRef<HTMLDivElement>(null)

  // Recale le mois affiché quand `value` change depuis l'extérieur (pas un
  // clic dans le calendrier lui-même) — pattern "adjust state on prop
  // change" recommandé par React, calculé pendant le rendu plutôt que dans
  // un effet pour éviter un second passage de rendu.
  const [prevValue, setPrevValue] = useState(value)
  if (value !== prevValue) {
    setPrevValue(value)
    if (selected) setCursor(selected)
  }

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [open])

  const displayLabel = selected
    ? `${pad2(selected.getDate())}/${pad2(selected.getMonth() + 1)}/${selected.getFullYear()}`
    : null

  const monthLabel = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(cursor)
  const weekdayLabels = useMemo(() => {
    // Semaine ISO (lundi en premier), 2 lettres.
    const base = new Date(2024, 0, 1) // un lundi
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(base)
      d.setDate(base.getDate() + i)
      return new Intl.DateTimeFormat(locale, { weekday: "narrow" }).format(d)
    })
  }, [locale])

  const days = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
    const startOffset = (first.getDay() + 6) % 7 // lundi = 0
    const gridStart = new Date(first)
    gridStart.setDate(first.getDate() - startOffset)
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(gridStart)
      d.setDate(gridStart.getDate() + i)
      return d
    })
  }, [cursor])

  const today = new Date()

  return (
    <div ref={wrapRef} style={{ position: "relative", ...style }}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((v) => !v)}
        style={{
          width: "100%", boxSizing: "border-box",
          display: "flex", alignItems: "center", gap: 8,
          fontSize: 13.5, color: displayLabel ? "#111827" : "#9CA3AF",
          padding: "9px 12px",
          background: "#FAFAFA",
          border: `1px solid ${open ? "#C4B6E0" : (borderColor ?? "#E5E7EB")}`,
          borderRadius: 9,
          outline: "none", fontFamily: "inherit",
          cursor: disabled ? "not-allowed" : "pointer",
          textAlign: "left",
          boxShadow: open ? "0 0 0 3px rgba(124,99,200,0.10)" : "none",
          transition: "border-color 120ms, box-shadow 120ms",
          opacity: disabled ? 0.6 : 1,
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7C63C8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flexShrink: 0 }}>
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 10h18M8 3v4M16 3v4" />
        </svg>
        <span style={{ flex: 1 }}>{displayLabel ?? t.placeholder}</span>
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 30,
          width: 260,
          background: "white", border: "1px solid #E2DAF6", borderRadius: 12,
          boxShadow: "0 14px 32px -10px rgba(17,24,39,0.18)",
          padding: 12,
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <button
              type="button"
              onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1))}
              aria-label={t.prevMonth}
              style={{
                width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center",
                border: "none", background: "transparent", borderRadius: 6, cursor: "pointer", color: "#7C63C8",
              }}
            >
              <svg width="10" height="10" viewBox="0 0 12 12"><path d="M8 1.5L3 6l5 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" /></svg>
            </button>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: "#111827", textTransform: "capitalize" }}>
              {monthLabel}
            </span>
            <button
              type="button"
              onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1))}
              aria-label={t.nextMonth}
              style={{
                width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center",
                border: "none", background: "transparent", borderRadius: 6, cursor: "pointer", color: "#7C63C8",
              }}
            >
              <svg width="10" height="10" viewBox="0 0 12 12"><path d="M4 1.5L9 6l-5 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" /></svg>
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 2 }}>
            {weekdayLabels.map((w, i) => (
              <div key={i} style={{ textAlign: "center", fontSize: 10, fontWeight: 700, color: "#9CA3AF", padding: "2px 0" }}>
                {w}
              </div>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
            {days.map((d, i) => {
              const inMonth = d.getMonth() === cursor.getMonth()
              const isSelected = selected && sameDay(d, selected)
              const isToday = sameDay(d, today)
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => { onChange(toIso(d)); setOpen(false) }}
                  style={{
                    aspectRatio: "1", width: "100%",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11.5, fontWeight: isSelected ? 700 : 500,
                    color: isSelected ? "white" : inMonth ? "#111827" : "#D1D5DB",
                    background: isSelected ? "#7C63C8" : "transparent",
                    border: isToday && !isSelected ? "1px solid #7C63C8" : "1px solid transparent",
                    borderRadius: 7, cursor: "pointer", fontFamily: "inherit",
                    padding: 0,
                  }}
                >
                  {d.getDate()}
                </button>
              )
            })}
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, paddingTop: 8, borderTop: "1px solid #F0ECF8" }}>
            <button
              type="button"
              onClick={() => { onChange(""); setOpen(false) }}
              style={{
                fontSize: 11.5, fontWeight: 600, color: "#6B7280",
                background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit", padding: 0,
              }}
            >
              {t.clear}
            </button>
            <button
              type="button"
              onClick={() => { onChange(toIso(today)); setCursor(today); setOpen(false) }}
              style={{
                fontSize: 11.5, fontWeight: 700, color: "#7C63C8",
                background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit", padding: 0,
              }}
            >
              {t.today}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
