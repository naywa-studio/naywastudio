'use client'

import { LazyMotion, domAnimation } from 'framer-motion'
import type { ReactNode } from 'react'

/**
 * Wraps the app in LazyMotion with domAnimation features.
 * This keeps the framer-motion animation bundle out of the initial JS payload
 * and loads it asynchronously (~18 kB saved from critical path).
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      {children}
    </LazyMotion>
  )
}
