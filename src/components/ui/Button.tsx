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
    'bg-[#7C63C8] text-white border border-[#7C63C8]',
    'hover:bg-[#6B54B2] hover:border-[#6B54B2]',
    'shadow-[0_1px_2px_rgba(0,0,0,0.06),0_6px_20px_rgba(124,99,200,0.22)]',
    'hover:shadow-[0_2px_4px_rgba(0,0,0,0.08),0_12px_32px_rgba(124,99,200,0.36)]',
  ].join(' '),
  ghost: [
    'bg-transparent text-[#4B5563] border border-transparent',
    'hover:bg-[#F8F6FF] hover:text-[#7C63C8]',
  ].join(' '),
  outline: [
    'bg-transparent text-[#4B5563] border border-[#E2DAF6]',
    'hover:border-[#7C63C8] hover:text-[#7C63C8] hover:bg-[rgba(124,99,200,0.04)]',
  ].join(' '),
}

const sizeStyles: Record<Size, string> = {
  sm: 'h-8 px-4 text-xs gap-1.5 rounded-[10px]',
  md: 'h-10 px-5 text-sm gap-2 rounded-[12px]',
  lg: 'h-12 px-7 text-base gap-2.5 rounded-[14px]',
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', children, className, ...props }, ref) => {
    return (
      <m.button
        ref={ref}
        whileHover={{ y: -2 }}
        whileTap={{ scale: 0.97 }}
        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        className={cn(
          'inline-flex items-center justify-center font-medium',
          'cursor-pointer select-none outline-none',
          'focus-visible:ring-2 focus-visible:ring-[#7C63C8] focus-visible:ring-offset-2 focus-visible:ring-offset-white',
          'disabled:opacity-40 disabled:pointer-events-none',
          'transition-all duration-200',
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
