"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useLanguage } from "@/lib/i18n/LanguageContext"

const copy = {
  fr: { placeholder: "Sélectionner…", noOptions: "Aucune option" },
  en: { placeholder: "Select…", noOptions: "No option" },
}

/**
 * Naywa-styled select — full replacement for native <select> so we control
 * both the closed trigger AND the option list (the native list is rendered
 * by the OS and can't be themed cross-browser).
 *
 * Keyboard: ↑ / ↓ to move, Enter to pick, Esc to close. Click outside
 * closes the popover.
 */

export interface SelectOption {
  value: string
  label: string
  /** Optional small text shown below the label. */
  hint?: string
}

/** Border-status kinds, alignés sur StyledSelect (formulaire mission). */
export type SelectBorderKind = "default" | "ok" | "required" | "optional"

const BORDER_COLORS: Record<SelectBorderKind, string> = {
  default:  "#E5E7EB",
  ok:       "#22C55E",
  required: "#EF4444",
  optional: "#F59E0B",
}

interface SelectProps {
  value: string
  onChange: (next: string) => void
  options: SelectOption[]
  /** Label shown when no option is selected (value === ""). */
  placeholder?: string
  /** Visually disable interactions. */
  disabled?: boolean
  /** Caller can constrain width via style; otherwise grows with parent. */
  style?: React.CSSProperties
  /** Pass to size the dropdown panel width; defaults to trigger width. */
  panelMinWidth?: number
  /** Border-status kind ("ok" vert / "required" rouge / "optional" orange)
   *  ou couleur hex custom. Défaut "default" gris. */
  border?: SelectBorderKind | string
  /** Label aria pour l'a11y quand pas de <label> autour. */
  ariaLabel?: string
}

export default function Select({
  value, onChange, options,
  placeholder,
  disabled = false,
  style,
  panelMinWidth,
  border = "default",
  ariaLabel,
}: SelectProps) {
  const { lang } = useLanguage()
  const t = copy[lang]
  const effectivePlaceholder = placeholder ?? t.placeholder
  const borderColor = border in BORDER_COLORS
    ? BORDER_COLORS[border as SelectBorderKind]
    : border
  const [open, setOpen] = useState(false)
  const [activeIdx, setActiveIdx] = useState(-1)
  const wrapRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  const selected = useMemo(() => options.find((o) => o.value === value) ?? null, [options, value])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
        setActiveIdx(-1)
      }
    }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [open])

  const onKey = (e: React.KeyboardEvent) => {
    if (disabled) return
    if (e.key === "ArrowDown") {
      e.preventDefault()
      if (!open) {
        const idx = options.findIndex((o) => o.value === value)
        setActiveIdx(idx >= 0 ? idx : 0)
        setOpen(true)
        return
      }
      setActiveIdx((i) => Math.min(options.length - 1, i + 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      if (!open) {
        const idx = options.findIndex((o) => o.value === value)
        setActiveIdx(idx >= 0 ? idx : 0)
        setOpen(true)
        return
      }
      setActiveIdx((i) => Math.max(0, i - 1))
    } else if (e.key === "Enter" || e.key === " ") {
      if (!open) {
        e.preventDefault()
        const idx = options.findIndex((o) => o.value === value)
        setActiveIdx(idx >= 0 ? idx : 0)
        setOpen(true)
        return
      }
      if (activeIdx >= 0 && activeIdx < options.length) {
        e.preventDefault()
        onChange(options[activeIdx].value)
        setOpen(false)
        setActiveIdx(-1)
        btnRef.current?.focus()
      }
    } else if (e.key === "Escape") {
      if (open) {
        e.preventDefault()
        setOpen(false)
        setActiveIdx(-1)
      }
    } else if (e.key === "Tab") {
      setOpen(false)
      setActiveIdx(-1)
    }
  }

  return (
    <div ref={wrapRef} style={{ position: "relative", ...style }}>
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onClick={() => {
          if (disabled) return
          if (open) {
            setOpen(false); setActiveIdx(-1)
          } else {
            const idx = options.findIndex((o) => o.value === value)
            setActiveIdx(idx >= 0 ? idx : 0)
            setOpen(true)
          }
        }}
        onKeyDown={onKey}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        style={{
          width: "100%", boxSizing: "border-box",
          display: "flex", alignItems: "center", gap: 8,
          fontSize: 13, color: selected ? "#111827" : "#6B7280",
          padding: "8px 12px",
          paddingRight: 32,
          background: "#FAFAFA",
          border: `1px solid ${open ? "#C4B6E0" : borderColor}`,
          borderRadius: 9,
          outline: "none",
          fontFamily: "inherit",
          cursor: disabled ? "not-allowed" : "pointer",
          textAlign: "left",
          boxShadow: open ? "0 0 0 3px rgba(124,99,200,0.10)" : "none",
          transition: "border-color 120ms, box-shadow 120ms",
          position: "relative",
          opacity: disabled ? 0.6 : 1,
        }}
      >
        <span style={{
          flex: 1, minWidth: 0, fontWeight: selected ? 600 : 400,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {selected ? selected.label : effectivePlaceholder}
        </span>
        <svg
          width="11" height="7" viewBox="0 0 12 8"
          style={{
            position: "absolute", right: 12, top: "50%",
            transform: `translateY(-50%) rotate(${open ? 180 : 0}deg)`,
            transition: "transform 160ms",
            color: "#7C63C8",
          }}
        >
          <path d="M1 1.5L6 6.5L11 1.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          style={{
            position: "absolute", top: "100%", left: 0,
            minWidth: panelMinWidth ?? "100%",
            marginTop: 4, zIndex: 30,
            background: "white",
            border: "1px solid #E2DAF6",
            borderRadius: 10,
            boxShadow: "0 14px 32px -10px rgba(17,24,39,0.18)",
            padding: 5,
            maxHeight: 280, overflowY: "auto",
          }}
        >
          {options.length === 0 && (
            <div style={{ padding: "10px 12px", fontSize: 12.5, color: "#6B7280" }}>
              {t.noOptions}
            </div>
          )}
          {options.map((opt, i) => {
            const active = i === activeIdx
            const isSelected = opt.value === value
            return (
              <button
                key={opt.value || `__${i}`}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  onChange(opt.value)
                  setOpen(false)
                  setActiveIdx(-1)
                  btnRef.current?.focus()
                }}
                onMouseEnter={() => setActiveIdx(i)}
                style={{
                  width: "100%", textAlign: "left",
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "8px 10px",
                  borderRadius: 7,
                  background: active ? "rgba(124,99,200,0.08)" : "transparent",
                  border: "none",
                  cursor: "pointer", fontFamily: "inherit",
                  fontSize: 13,
                  color: isSelected ? "#7C63C8" : "#111827",
                  fontWeight: isSelected ? 700 : 500,
                }}
              >
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {opt.label}
                  {opt.hint && (
                    <span style={{ fontSize: 11, color: "#6B7280", fontWeight: 400, marginLeft: 6 }}>
                      {opt.hint}
                    </span>
                  )}
                </span>
                {isSelected && (
                  <svg width="13" height="13" viewBox="0 0 16 16" style={{ color: "#7C63C8", flexShrink: 0 }}>
                    <path d="M3 8.5L6.5 12L13 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                  </svg>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
