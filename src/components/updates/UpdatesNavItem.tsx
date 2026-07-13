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
import { useLanguage } from "@/lib/i18n/LanguageContext"

const copy = {
  fr: {
    unread: (n: number) => `${n} nouveauté${n > 1 ? "s" : ""} non lue${n > 1 ? "s" : ""}`,
    sectionUpdate: "Nouveauté pour cette section",
  },
  en: {
    unread: (n: number) => `${n} unread update${n > 1 ? "s" : ""}`,
    sectionUpdate: "New update for this section",
  },
}

export function UpdatesNavBadge({ size = 7 }: { size?: number }) {
  const { lang } = useLanguage()
  const { unreadCount } = useUnreadUpdates()
  if (unreadCount === 0) return null
  return (
    <span
      aria-label={copy[lang].unread(unreadCount)}
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
 * Pastille violette affichée sur un item de menu donné quand au moins
 * une nouveauté non-lue a tagué ce path dans son affected_paths. Plus
 * fin que UpdatesNavBadge (global) : permet de pointer l'utilisateur
 * vers la zone concernée.
 *
 * Pas de styling parent : on dépend de l'environnement (gap, flex)
 * du Link englobant. Le composant ne rend rien si pas concerné.
 */
export function NavUnreadDot({ href, size = 6 }: { href: string; size?: number }) {
  const { lang } = useLanguage()
  const { unreadPaths } = useUnreadUpdates()
  if (!unreadPaths.has(href)) return null
  return (
    <span
      aria-label={copy[lang].sectionUpdate}
      title={copy[lang].sectionUpdate}
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
