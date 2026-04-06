import { type ReactNode } from 'react'
import { cn } from '@/lib/utils'

type BadgeVariant = 'blue' | 'purple' | 'green' | 'gray'

interface BadgeProps {
  variant?: BadgeVariant
  className?: string
  children: ReactNode
}

const variantStyles: Record<BadgeVariant, string> = {
  blue:   'bg-[#0066FF]/15 text-[#60A5FA] border-[#0066FF]/25',
  purple: 'bg-[#7C3AED]/15 text-[#A78BFA] border-[#7C3AED]/25',
  green:  'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
  gray:   'bg-[#1E1E2E] text-[#8B8BA8] border-[#2E2E4E]',
}

export function Badge({ variant = 'gray', className, children }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5',
        'text-xs font-medium leading-none tracking-wide',
        variantStyles[variant],
        className,
      )}
    >
      {children}
    </span>
  )
}
