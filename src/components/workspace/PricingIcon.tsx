/**
 * PricingIcon — icône inline réutilisable pour les titres et liens pricing.
 *
 * Remplace l'émoji 💰 (rendu inégal selon l'OS, ne suit pas la couleur). Cette
 * version est un SVG qui hérite de la couleur courante via `currentColor`, donc
 * s'aligne sur le contexte (violet, blanc, gris…).
 */

export default function PricingIcon({
  size = 14,
  style,
}: {
  size?: number
  style?: React.CSSProperties
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      style={{ display: "inline-block", verticalAlign: "-2px", ...style }}
    >
      <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M10.4 6c-.55-.55-1.4-.95-2.3-.95-1.6 0-2.85 1.2-2.85 2.95s1.25 2.95 2.85 2.95c.9 0 1.75-.4 2.3-.95"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <path
        d="M4.8 7.3h3.2M4.8 8.7h3.2"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
    </svg>
  )
}
