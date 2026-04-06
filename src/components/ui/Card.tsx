import { type ReactNode, forwardRef } from 'react'
import { cn } from '@/lib/utils'

type CardVariant = 'default' | 'glass'

interface CardProps {
  variant?: CardVariant
  className?: string
  children: ReactNode
  hover?: boolean
}

const Card = forwardRef<HTMLDivElement, CardProps & React.HTMLAttributes<HTMLDivElement>>(
  ({ variant = 'default', hover = true, className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'rounded-xl border transition-all duration-300',
          // default variant
          variant === 'default' && [
            'bg-[#111118] border-[#1E1E2E]',
            hover && [
              'hover:border-[#2E2E4E]',
              'hover:shadow-[0_0_32px_0_rgba(0,102,255,0.08)]',
            ],
          ],
          // glass variant
          variant === 'glass' && [
            'bg-white/[0.04] backdrop-blur-md border-white/[0.08]',
            hover && [
              'hover:bg-white/[0.07] hover:border-white/[0.12]',
              'hover:shadow-[0_0_32px_0_rgba(0,102,255,0.08)]',
            ],
          ],
          className,
        )}
        {...props}
      >
        {children}
      </div>
    )
  },
)
Card.displayName = 'Card'

interface CardHeaderProps {
  className?: string
  children: ReactNode
}

function CardHeader({ className, children }: CardHeaderProps) {
  return <div className={cn('p-6 pb-0', className)}>{children}</div>
}

function CardContent({ className, children }: CardHeaderProps) {
  return <div className={cn('p-6', className)}>{children}</div>
}

function CardFooter({ className, children }: CardHeaderProps) {
  return (
    <div className={cn('p-6 pt-0 flex items-center', className)}>{children}</div>
  )
}

export { Card, CardHeader, CardContent, CardFooter }
