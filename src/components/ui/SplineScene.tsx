'use client'

import dynamic from 'next/dynamic'
import { cn } from '@/lib/utils'

const Spline = dynamic(() => import('@splinetool/react-spline'), {
  ssr: false,
  loading: () => <SplineSkeleton />,
})

function SplineSkeleton() {
  return (
    <div className="h-full w-full flex items-center justify-center">
      <div className="relative h-64 w-64 md:h-80 md:w-80">
        {/* Outer ring */}
        <div className="absolute inset-0 rounded-full border border-[#0066FF]/20 animate-ping" />
        {/* Mid ring */}
        <div className="absolute inset-8 rounded-full border border-[#7C3AED]/30 animate-pulse" />
        {/* Inner glow */}
        <div className="absolute inset-16 rounded-full bg-[#0066FF]/10 blur-xl animate-pulse" />
        {/* Center dot */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-3 w-3 rounded-full bg-[#0066FF] shadow-[0_0_16px_4px_rgba(0,102,255,0.5)] animate-pulse" />
        </div>
      </div>
    </div>
  )
}

interface SplineSceneProps {
  sceneUrl: string
  className?: string
  onLoad?: () => void
}

export function SplineScene({ sceneUrl, className, onLoad }: SplineSceneProps) {
  return (
    <div className={cn('relative overflow-hidden', className)}>
      <Spline
        scene={sceneUrl}
        onLoad={onLoad}
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  )
}
