type LogoSize = 'sm' | 'md' | 'lg'

interface LogoProps {
  size?: LogoSize
  /** light=true → white text (on dark background) */
  light?: boolean
}

/**
 * Logo intentionally renders nothing across the site.
 * Kept as a no-op component so existing imports keep working without
 * having to touch every page that references it.
 */
export function Logo(_props: LogoProps) {
  return null
}
