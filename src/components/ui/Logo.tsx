type LogoSize = 'sm' | 'md' | 'lg'

interface LogoProps {
  size?: LogoSize
  light?: boolean
}

export function Logo({ size = 'md', light = false }: LogoProps) {
  const s = size === 'sm' ? 24 : size === 'lg' ? 44 : 32
  const fontSize = s * 0.5

  const accent = light ? '#FFFFFF' : '#7C63C8'
  const textColor = light ? '#FFFFFF' : '#111827'
  const bgFill = light ? 'rgba(255,255,255,0.18)' : '#7C63C8'
  const bgFillOpacity = light ? 1 : 0.08

  return (
    <div className="flex items-center gap-2 select-none">
      <svg
        width={s}
        height={s}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <rect width="32" height="32" rx="8" fill={bgFill} fillOpacity={bgFillOpacity} />
        {/* Geometric N */}
        <path
          d="M9 23V9l7 9 7-9v14"
          stroke={accent}
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        {/* Wave accent on centre bar */}
        <path
          d="M13 17.5 Q16 15 19 17.5"
          stroke={accent}
          strokeWidth="1.5"
          strokeLinecap="round"
          fill="none"
          opacity="0.5"
        />
      </svg>
      <span
        style={{
          fontFamily: 'var(--font-space-grotesk), sans-serif',
          fontWeight: 600,
          fontSize,
          color: textColor,
          letterSpacing: '-0.01em',
          lineHeight: 1,
          transition: 'color 200ms',
        }}
      >
        Nawa Studio
      </span>
    </div>
  )
}
