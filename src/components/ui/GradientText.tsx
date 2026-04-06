import { type ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface GradientTextProps {
  children: ReactNode
  className?: string
  /** Gradient direction — default left-to-right */
  direction?: 'horizontal' | 'diagonal'
}

export function GradientText({
  children,
  className,
  direction = 'horizontal',
}: GradientTextProps) {
  return (
    <span
      className={cn(
        'bg-clip-text text-transparent',
        direction === 'horizontal'
          ? 'bg-linear-to-r from-[#0066FF] via-[#3B82F6] to-[#7C3AED]'
          : 'bg-linear-to-br from-[#0066FF] via-[#6366F1] to-[#7C3AED]',
        className,
      )}
    >
      {children}
    </span>
  )
}
