import type { CSSProperties, ReactNode } from "react"

/**
 * EyebrowTag — l'accroche courte posée AU-DESSUS d'un titre.
 *
 * Deux variantes (les deux patterns déjà présents sur le site, désormais
 * centralisés ici pour arrêter de les recopier à la main partout) :
 *
 *  - `pill`  (défaut) : pastille violette avec un point — style du hero.
 *  - `label`          : petit texte violet en capitales espacées —
 *                       style des sections marketing ("NOS SOLUTIONS", "TARIFS").
 */
interface EyebrowTagProps {
  children: ReactNode
  variant?: "pill" | "label"
  /** Styles additionnels (ex. margin) fusionnés au style de base. */
  style?: CSSProperties
}

export function EyebrowTag({ children, variant = "pill", style }: EyebrowTagProps) {
  if (variant === "label") {
    return (
      <span
        style={{
          display: "inline-block",
          fontFamily: "var(--font-inter), sans-serif",
          fontSize: 12.5,
          fontWeight: 700,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--accent-blue, #7C63C8)",
          ...style,
        }}
      >
        {children}
      </span>
    )
  }

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "7px 15px 7px 12px",
        borderRadius: "var(--radius-pill, 999px)",
        background: "rgba(124,99,200,0.07)",
        border: "1px solid rgba(124,99,200,0.20)",
        fontFamily: "var(--font-inter), sans-serif",
        fontSize: 12.5,
        fontWeight: 600,
        color: "var(--accent-blue, #7C63C8)",
        letterSpacing: "-0.005em",
        ...style,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: "var(--accent-blue, #7C63C8)",
          boxShadow: "0 0 0 3px rgba(124,99,200,0.16)",
          display: "inline-block",
          flexShrink: 0,
        }}
      />
      {children}
    </span>
  )
}
