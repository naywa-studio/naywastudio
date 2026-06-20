"use client"

/**
 * Item de menu "Nouveautés" pour la sidebar workspace + organisation.
 * Affiche une pastille violette si au moins une nouveauté non-lue.
 *
 * Composé visuellement comme un Link simple — c'est au layout parent
 * de décider du style (active/inactive). Ce composant n'expose que
 * le contenu (icon + label + pastille).
 */

import { useUnreadUpdates } from "./useUnreadUpdates"

export function UpdatesNavBadge({ size = 7 }: { size?: number }) {
  const { unreadCount } = useUnreadUpdates()
  if (unreadCount === 0) return null
  return (
    <span
      aria-label={`${unreadCount} nouveauté${unreadCount > 1 ? "s" : ""} non lue${unreadCount > 1 ? "s" : ""}`}
      style={{
        display: "inline-block",
        width: size, height: size,
        borderRadius: "50%",
        background: "#7C63C8",
        boxShadow: "0 0 0 2px white",
        flexShrink: 0,
      }}
    />
  )
}

/**
 * Icône SVG "sparkle" pour l'item Nouveautés. Style trait fin
 * géométrique, conforme au design system Naywa (pas d'emoji).
 */
export function UpdatesIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="1.7"
      strokeLinecap="round" strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 3v3" />
      <path d="M12 18v3" />
      <path d="M3 12h3" />
      <path d="M18 12h3" />
      <path d="M6 6l2 2" />
      <path d="M16 16l2 2" />
      <path d="M6 18l2-2" />
      <path d="M16 8l2-2" />
    </svg>
  )
}
