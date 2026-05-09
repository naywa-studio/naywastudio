type LogoSize = 'sm' | 'md' | 'lg'

interface LogoProps {
  size?: LogoSize
  /** light=true → white text (on dark background) */
  light?: boolean
  /** Hide the wordmark, keep only the italic "N" mark */
  markOnly?: boolean
}

/**
 * Naywa Studio wordmark — italic "N" in Instrument Serif (violet
 * gradient) followed by "Naywa Studio" in Inter weight 600.
 * Pure typography, no SVG, no PNG asset.
 */
export function Logo({ size = 'md', light = false, markOnly = false }: LogoProps) {
  const markPx   = size === 'sm' ? 30 : size === 'lg' ? 50 : 38
  const fontSize = size === 'sm' ? 14 : size === 'lg' ? 20 : 16
  const gap      = size === 'sm' ?  6 : size === 'lg' ? 10 :  8
  const wordmarkColor = light ? '#FFFFFF' : '#111827'

  return (
    <div
      style={{
        display:    'inline-flex',
        alignItems: 'baseline',
        gap,
        userSelect: 'none',
        flexShrink: 0,
        lineHeight: 1,
      }}
    >
      {/* Italic serif "N" — gradient violet */}
      <span
        aria-hidden
        style={{
          fontFamily:    'var(--font-instrument-serif), ui-serif, Georgia, serif',
          fontStyle:     'italic',
          fontWeight:    400,
          fontSize:      markPx,
          lineHeight:    0.9,
          letterSpacing: '-0.03em',
          background:    'linear-gradient(120deg, #7C63C8 0%, #B8AEDE 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor:  'transparent',
          backgroundClip:       'text',
          /* Slight optical balance — italic N rises a touch on its baseline */
          transform: 'translateY(2px)',
        }}
      >
        N
      </span>

      {/* Wordmark */}
      {!markOnly && (
        <span
          style={{
            fontFamily:    'var(--font-inter), sans-serif',
            fontWeight:    600,
            fontSize,
            color:         wordmarkColor,
            letterSpacing: '-0.012em',
          }}
        >
          Naywa Studio
        </span>
      )}
    </div>
  )
}
