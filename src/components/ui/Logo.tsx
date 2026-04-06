type LogoSize = 'sm' | 'md' | 'lg'

export function Logo({ size = 'md' }: { size?: LogoSize }) {
  const s = size === 'sm' ? 24 : size === 'lg' ? 44 : 32
  const fontSize = s * 0.5

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
        <rect width="32" height="32" rx="8" fill="#7C63C8" fillOpacity="0.08" />
        {/* Geometric N */}
        <path
          d="M9 23V9l7 9 7-9v14"
          stroke="#7C63C8"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        {/* Wave accent on centre bar */}
        <path
          d="M13 17.5 Q16 15 19 17.5"
          stroke="#7C63C8"
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
          color: '#111827',
          letterSpacing: '-0.01em',
          lineHeight: 1,
        }}
      >
        Nawa Studio
      </span>
    </div>
  )
}
