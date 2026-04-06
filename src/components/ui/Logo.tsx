import { cn } from '@/lib/utils'

type LogoSize = 'sm' | 'md' | 'lg'

interface LogoProps {
  size?: LogoSize
  showText?: boolean
  className?: string
}

const px: Record<LogoSize, number> = { sm: 24, md: 32, lg: 48 }
const textSizes: Record<LogoSize, string> = {
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-xl',
}

export function Logo({ size = 'md', showText = true, className }: LogoProps) {
  const dim = px[size]

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {/* SVG mark — two interlocking arcs forming an abstract N */}
      <svg
        width={dim}
        height={dim}
        viewBox="0 0 40 40"
        fill="none"
        aria-hidden="true"
      >
        {/* Upper arc — blue */}
        <path
          d="M6 28 C8 16, 15 10, 20 10 C25 10, 32 16, 34 28"
          stroke="#0066FF"
          strokeWidth="3.2"
          strokeLinecap="round"
          fill="none"
        />
        {/* Lower arc — violet, slightly offset to create interlock */}
        <path
          d="M6 20 C8 30, 15 34, 20 34 C25 34, 32 30, 34 20"
          stroke="#7C3AED"
          strokeWidth="3.2"
          strokeLinecap="round"
          fill="none"
          opacity="0.75"
        />
        {/* Central node dot */}
        <circle cx="20" cy="22" r="2" fill="#0066FF" opacity="0.9" />
      </svg>

      {showText && (
        <span
          className={cn(
            'font-semibold tracking-tight text-[#F8F8FF] leading-none',
            textSizes[size],
          )}
          style={{ fontFamily: 'var(--font-space-grotesk)' }}
        >
          Nawa Studio
        </span>
      )}
    </div>
  )
}
