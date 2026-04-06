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
    'bg-[#3D8B5E] text-white border border-[#3D8B5E]',
    'hover:bg-[#2E7050] hover:border-[#2E7050]',
  ].join(' '),
  ghost: [
    'bg-transparent text-[#111827] border border-transparent',
    'hover:bg-[#F5FAF6]',
  ].join(' '),
  outline: [
    'bg-transparent text-[#111827] border border-[#E4EDE6]',
    'hover:border-[#9CA3AF]',
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
          'focus-visible:ring-2 focus-visible:ring-[#3D8B5E] focus-visible:ring-offset-2 focus-visible:ring-offset-white',
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
