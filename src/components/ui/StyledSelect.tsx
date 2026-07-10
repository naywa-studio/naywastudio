"use client"

/**
 * StyledSelect — wrapper de <select> au look design-system Naywa.
 *
 * Pourquoi pas un dropdown headless type Radix : un vrai <select> reste
 * le mieux pour l'accessibilité clavier, le mobile (le picker natif iOS
 * / Android s'ouvre) et les form labels. On garde l'élément natif, on
 * masque juste son look par défaut (appearance: none) et on dessine la
 * chevron par-dessus.
 *
 * Trois variantes de border :
 *   - "default"   : gris neutre (formulaires courants)
 *   - "ok"        : vert (champ rempli — utilisé par le formulaire mission)
 *   - "required"  : rouge (champ obligatoire manquant)
 *   - "optional"  : orange (champ facultatif manquant)
 *
 * On peut aussi passer une couleur custom via la prop `border`.
 */

import type { CSSProperties } from "react"

export type StyledSelectBorderKind = "default" | "ok" | "required" | "optional"

const BORDER_COLORS: Record<StyledSelectBorderKind, string> = {
  default:  "#E5E7EB",
  ok:       "#22C55E",
  required: "#EF4444",
  optional: "#F59E0B",
}

export interface StyledSelectOption {
  value: string
  label: string
}

interface Props {
  value: string
  onChange: (v: string) => void
  options: StyledSelectOption[]
  placeholder?: string
  /** Kind de bordure prédéfini ou couleur hex. Défaut "default". */
  border?: StyledSelectBorderKind | string
  /** Désactive le select (style grisé). */
  disabled?: boolean
  /** Largeur custom (par défaut 100 %). */
  width?: string | number
  /** Surcharge inline pour les cas particuliers. */
  style?: CSSProperties
  /** Label aria pour l'a11y quand pas de <label> autour. */
  ariaLabel?: string
}

export function StyledSelect({
  value, onChange, options, placeholder,
  border = "default", disabled, width = "100%",
  style, ariaLabel,
}: Props) {
  const borderColor = border in BORDER_COLORS
    ? BORDER_COLORS[border as StyledSelectBorderKind]
    : border

  return (
    <div style={{ position: "relative", width }}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-label={ariaLabel}
        style={{
          width: "100%",
          boxSizing: "border-box",
          fontSize: 13.5,
          color: disabled ? "#6B7280" : "#111827",
          padding: "9px 36px 9px 12px",
          background: disabled ? "#F3F4F6" : "#FAFAFA",
          border: `1px solid ${borderColor}`,
          borderRadius: 9,
          outline: "none",
          appearance: "none",
          WebkitAppearance: "none",
          MozAppearance: "none",
          cursor: disabled ? "not-allowed" : "pointer",
          fontFamily: "var(--font-inter), sans-serif",
          transition: "border-color 150ms ease, box-shadow 150ms ease",
          ...style,
        }}
        onFocus={(e) => {
          if (!disabled) {
            e.currentTarget.style.boxShadow = "0 0 0 3px rgba(124,99,200,0.15)"
            e.currentTarget.style.borderColor = "#7C63C8"
          }
        }}
        onBlur={(e) => {
          e.currentTarget.style.boxShadow = "none"
          e.currentTarget.style.borderColor = borderColor
        }}
      >
        {placeholder !== undefined && (
          <option value="">{placeholder}</option>
        )}
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <svg
        width="14" height="14" viewBox="0 0 20 20" fill="none"
        aria-hidden
        style={{
          position: "absolute",
          right: 12,
          top: "50%",
          transform: "translateY(-50%)",
          pointerEvents: "none",
          color: disabled ? "#D1D5DB" : "#6B7280",
        }}
      >
        <path d="M5 8l5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  )
}
