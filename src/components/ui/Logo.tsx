import Image from 'next/image'

type LogoSize = 'sm' | 'md' | 'lg'

interface LogoProps {
  size?: LogoSize
  /** Hide the wordmark, keep only the violet "N" mark. */
  markOnly?: boolean
  /** Reserved — kept for backward compatibility, currently unused
   *  because the SVG palette is fixed. */
  light?: boolean
}

/**
 * Naywa Studio logo — bitmap rendering of the brand SVGs.
 *
 *  - markOnly=false (default) → /public/naywa-logo-full.svg
 *  - markOnly=true            → /public/naywa-logo-mark.svg (the "N" only)
 *
 * The SVGs already have their own viewBox so we just constrain the
 * height; width auto-scales proportionally. The flex container keeps
 * the asset vertically centered inside its parent.
 */
export function Logo({ size = 'md', markOnly = false }: LogoProps) {
  const heightPx = markOnly
    ? (size === 'sm' ? 26 : size === 'lg' ? 44 : 34)
    : (size === 'sm' ? 22 : size === 'lg' ? 38 : 28)

  // Original SVG aspect ratios (width / height)
  const fullAspect = 1280 / 832
  const markAspect = 477 / 589

  const aspect    = markOnly ? markAspect : fullAspect
  const widthPx   = Math.round(heightPx * aspect)

  const src = markOnly ? '/naywa-logo-mark.svg' : '/naywa-logo-full.svg'

  return (
    <span
      style={{
        display:        'inline-flex',
        alignItems:     'center',
        justifyContent: 'center',
        userSelect:     'none',
        flexShrink:     0,
        height:         heightPx,
        lineHeight:     0,
      }}
    >
      <Image
        src={src}
        alt="Naywa Studio"
        width={widthPx}
        height={heightPx}
        priority
        style={{
          display:    'block',
          height:     heightPx,
          width:      'auto',
          objectFit:  'contain',
        }}
      />
    </span>
  )
}
