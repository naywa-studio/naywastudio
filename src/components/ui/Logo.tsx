import Image from 'next/image'

type LogoSize = 'sm' | 'md' | 'lg'

interface LogoProps {
  size?: LogoSize
  /** light=true → white text (on dark background) */
  light?: boolean
}

export function Logo({ size = 'md', light = false }: LogoProps) {
  const markPx   = size === 'sm' ? 28  : size === 'lg' ? 48  : 36
  const fontSize = size === 'sm' ? 14  : size === 'lg' ? 20  : 16
  const gap      = size === 'sm' ? 8   : size === 'lg' ? 12  : 10
  const textColor = light ? '#FFFFFF' : '#111827'

  return (
    <div
      style={{
        display:    'flex',
        alignItems: 'center',
        gap,
        userSelect: 'none',
        flexShrink: 0,
      }}
    >
      {/* Logo mark — trimmed illustration, nearly square */}
      <Image
        src="/logo-mark.png"
        alt="Nawa Studio"
        width={markPx}
        height={markPx}
        priority
        style={{ display: 'block', objectFit: 'contain' }}
      />

      {/* Wordmark */}
      <span
        style={{
          fontFamily:   'var(--font-space-grotesk), sans-serif',
          fontWeight:   600,
          fontSize,
          color:        textColor,
          letterSpacing: '-0.01em',
          lineHeight:   1,
          transition:   'color 200ms',
        }}
      >
        Nawa Studio
      </span>
    </div>
  )
}
