'use client'

import { m, type HTMLMotionProps } from 'framer-motion'
import { type ReactNode, forwardRef } from 'react'
import { cn } from '@/lib/utils'

type Variant = 'primary' | 'ghost' | 'outline'
type Size = 'sm' | 'md' | 'lg'

interface ButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  variant?: Variant
  size?: Size
  children: ReactNode
  asChild?: boolean
  href?: string
}

const variantStyles: Record<Variant, string> = {
  primary: [
    'bg-[#0066FF] text-white border border-[#0066FF]',
    'hover:bg-[#0047CC] hover:border-[#0047CC]',
    'shadow-[0_0_0_0_rgba(0,102,255,0)] hover:shadow-[0_0_24px_4px_rgba(0,102,255,0.35)]',
    'transition-shadow',
  ].join(' '),
  ghost: [
    'bg-transparent text-[#F8F8FF] border border-transparent',
    'hover:bg-[#1E1E2E] hover:border-[#1E1E2E]',
  ].join(' '),
  outline: [
    'bg-transparent text-[#F8F8FF] border border-[#1E1E2E]',
    'hover:border-[#0066FF] hover:text-[#0066FF]',
  ].join(' '),
}

const sizeStyles: Record<Size, string> = {
  sm: 'h-8 px-4 text-xs gap-1.5',
  md: 'h-10 px-5 text-sm gap-2',
  lg: 'h-12 px-7 text-base gap-2.5',
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', children, className, ...props }, ref) => {
    return (
      <m.button
        ref={ref}
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.97 }}
        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        className={cn(
          'inline-flex items-center justify-center rounded-lg font-medium',
          'cursor-pointer select-none outline-none',
          'focus-visible:ring-2 focus-visible:ring-[#0066FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0A0F]',
          'disabled:opacity-40 disabled:pointer-events-none',
          'transition-colors duration-200',
          variantStyles[variant],
          sizeStyles[size],
          className,
        )}
        {...props}
      >
        {children}
      </m.button>
    )
  },
)
Button.displayName = 'Button'

export { Button }
